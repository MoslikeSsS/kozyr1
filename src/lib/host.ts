import { HostNet, GuestNet, randomCode } from './net';
import { PokerEngine, type EngineHooks } from './poker';
import { DurakEngine, type DurakHooks } from './durak';
import { sortHand } from './cards';
import type {
  AdminCmd, Card, DurakView, GameKind, DurakMode, LobbyInfo, Msg,
  PokerView, SeatMeta, SeatView, View,
} from './types';

export type RoomCallbacks = {
  onView: (v: View) => void;
  onLobby: (l: LobbyInfo) => void;
  onEv: (kind: string) => void;
  onChat: (from: string, text: string, mine: boolean) => void;
  onToast: (msg: string, tone?: 'info' | 'err' | 'ok') => void;
  onLeft: (reason: string) => void;
};

export type SessionHandle = {
  isHost: boolean;
  action: (a: string, c?: Card, v?: number) => void;
  chat: (text: string) => void;
  admin: (cmd: AdminCmd) => void;
  leave: () => void;
};

type SeatRec = {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
  connId?: string;
};

const BOT_NAMES = ['Валет', 'Козырь', 'Шестёрка', 'Тузяра', 'Битый', 'Фартовый'];

export class HostCore {
  seats: SeatRec[] = [];
  game: GameKind;
  mode: DurakMode;
  sb = 10;
  bb = 20;
  maxSeats = 6;
  code: string;
  started = false;
  poker: PokerEngine | null = null;
  durak: DurakEngine | null = null;
  log: string[] = [];
  net: HostNet | null = null;
  mySeatId = 'host';
  private timers = new Set<number>();
  private pending: number | null = null;
  private botN = 0;
  private hostName: string;

  constructor(
    private cb: RoomCallbacks,
    opts: { name: string; game: GameKind; mode?: DurakMode; code?: string; withNet: boolean },
  ) {
    this.game = opts.game;
    this.mode = opts.mode ?? 'classic';
    this.hostName = opts.name || 'Хост';
    this.code = opts.code ?? randomCode();
    this.seats.push({ id: 'host', name: this.hostName, bot: false, connected: true, isHost: true });
    if (opts.withNet) {
      this.net = new HostNet(this.code, {
        onReady: (code) => {
          this.code = code;
          this.pushLog(`Комната ${code} готова — ждём игроков`);
          this.sendLobby();
          this.broadcast();
        },
        onJoin: (connId) => {
          const t = window.setTimeout(() => {
            if (!this.seats.some((s) => s.connId === connId)) this.net?.kick(connId);
          }, 7000);
          this.timers.add(t);
        },
        onData: (connId, msg) => this.onMsg(connId, msg),
        onLeave: (connId) => this.onConnLeave(connId),
        onError: (m) => this.cb.onToast(m, 'err'),
      });
    } else {
      this.pushLog('Локальная игра (оффлайн, с ботами)');
    }
  }

  /* ---------- служебное ---------- */
  private pushLog(s: string) {
    this.log.push(s);
    if (this.log.length > 80) this.log.shift();
  }
  private schedule(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  private seatMeta(): SeatMeta[] {
    return this.seats.map((s) => ({ id: s.id, name: s.name, bot: s.bot, connected: s.connected, isHost: s.isHost }));
  }
  lobbyInfo(): LobbyInfo {
    return {
      code: this.code, game: this.game, mode: this.mode, sb: this.sb, bb: this.bb,
      maxSeats: this.maxSeats, started: this.started, seats: this.seatMeta(),
    };
  }
  private sendLobby() {
    const l = this.lobbyInfo();
    this.cb.onLobby(l);
    this.net?.broadcast({ t: 'lobby', lobby: l });
  }
  private emit(kind: string) {
    this.cb.onEv(kind);
    this.net?.broadcast({ t: 'ev', kind });
  }
  private order(): string[] {
    return this.seats.filter((s) => s.bot || s.connected).map((s) => s.id);
  }

  private hooks: EngineHooks & DurakHooks = {
    emit: (k) => this.emit(k),
    update: () => { this.broadcast(); this.pump(); },
    schedule: (fn, ms) => this.schedule(fn, ms),
    handEnded: () => this.onHandEnded(),
    log: (s) => this.pushLog(s),
  };

  private onHandEnded() {
    if (this.poker) {
      if (this.poker.matchWinner) return; // ждём рестарта от хоста
      this.poker.nextHand(this.order(), 1000);
    }
    // durak: матч окончен — ждём рестарта
  }

  /* ---------- сеть ---------- */
  private onMsg(connId: string, msg: Msg) {
    switch (msg.t) {
      case 'hello': {
        if (this.seats.some((s) => s.connId === connId)) return;
        if (this.seats.length >= this.maxSeats) {
          this.net?.send(connId, { t: 'err', msg: 'Комната заполнена' });
          this.net?.kick(connId);
          return;
        }
        const name = (msg.name || 'Гость').slice(0, 16);
        this.seats.push({ id: connId, name, bot: false, connected: true, isHost: false, connId });
        this.net?.send(connId, { t: 'welcome', seatId: connId, lobby: this.lobbyInfo() });
        this.pushLog(`${name} входит в комнату`);
        this.cb.onToast(`${name} подключается`, 'ok');
        this.emit('join');
        this.sendLobby();
        this.broadcast();
        break;
      }
      case 'action': {
        const seat = this.seats.find((s) => s.connId === connId);
        if (seat) this.action(seat.id, msg.a, msg.c, msg.v);
        break;
      }
      case 'chat': {
        const seat = this.seats.find((s) => s.connId === connId);
        if (seat) this.chat(seat.name, msg.text ?? '', false);
        break;
      }
      default:
        break;
    }
  }

  private onConnLeave(connId: string) {
    const seat = this.seats.find((s) => s.connId === connId);
    if (!seat) return;
    seat.connected = false;
    this.pushLog(`${seat.name} отключается`);
    this.cb.onToast(`${seat.name} отключился`, 'err');
    this.emit('leave');
    if (!this.started) {
      this.seats = this.seats.filter((s) => s.id !== seat.id);
    } else {
      if (this.poker) this.poker.seatOut(seat.id);
      if (this.durak) this.durak.seatOut(seat.id);
      this.broadcast();
    }
    this.sendLobby();
  }

  /* ---------- действия ---------- */
  action(seatId: string, a: string, c?: Card, v?: number) {
    if (this.poker && ['fold', 'check', 'call', 'raise'].includes(a)) {
      this.poker.act(seatId, a as 'fold' | 'check' | 'call' | 'raise', v);
    } else if (this.durak) {
      this.durak.act(seatId, a as 'attack' | 'beat' | 'take' | 'transfer' | 'bito' | 'doneTaking', c);
    }
  }

  chat(from: string, text: string, mine: boolean) {
    const clean = text.trim().slice(0, 140);
    if (!clean) return;
    this.cb.onChat(from, clean, mine);
    this.net?.broadcast({ t: 'chat', from, text: clean });
  }

  addBot(): string | null {
    if (this.seats.length >= this.maxSeats) {
      this.cb.onToast('Комната заполнена (макс. 6)', 'err');
      return null;
    }
    this.botN++;
    const id = 'bot-' + this.botN + '-' + Math.floor(Math.random() * 999);
    const name = BOT_NAMES[(this.botN - 1) % BOT_NAMES.length] + ' ' + (this.botN > BOT_NAMES.length ? 'II' : '');
    this.seats.push({ id, name, bot: true, connected: true, isHost: false });
    this.pushLog(`Бот ${name} за столом`);
    this.cb.onToast(`Бот ${name} добавлен`, 'ok');
    this.emit('join');
    this.sendLobby();
    this.broadcast();
    return id;
  }

  kick(seatId: string) {
    if (seatId === 'host') return;
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) return;
    if (seat.connId) this.net?.kick(seat.connId);
    this.seats = this.seats.filter((s) => s.id !== seatId);
    this.pushLog(`${seat.name} кикнут админом`);
    this.cb.onToast(`${seat.name} удалён из комнаты`, 'info');
    if (this.started) {
      if (this.poker) this.poker.seatOut(seatId);
      if (this.durak) this.durak.seatOut(seatId);
      this.broadcast();
    }
    this.sendLobby();
  }

  startGame() {
    const players = this.order();
    if (players.length < 2) {
      this.cb.onToast('Нужно минимум 2 игрока — добавьте бота', 'err');
      return;
    }
    this.started = true;
    this.poker = null;
    this.durak = null;
    if (this.game === 'poker') {
      const e = new PokerEngine(this.hooks);
      e.sb = this.sb;
      e.bb = this.bb;
      this.poker = e;
      e.nextHand(players, 1000);
    } else {
      const e = new DurakEngine(this.hooks);
      this.durak = e;
      e.newGame(players, this.mode);
    }
    this.pushLog(`Игра началась: ${this.game === 'poker' ? 'покер' : this.mode === 'transfer' ? 'переводной дурак' : 'подкидной дурак'}`);
    this.emit('start');
    this.sendLobby();
  }

  endGame() {
    this.started = false;
    this.poker = null;
    this.durak = null;
    this.pushLog('Игра остановлена — все в лобби');
    this.cb.onToast('Игра остановлена', 'info');
    this.sendLobby();
    this.broadcast();
  }

  admin(cmd: AdminCmd) {
    switch (cmd.cmd) {
      case 'kick': this.kick(cmd.seatId); break;
      case 'addBot': this.addBot(); break;
      case 'start': this.startGame(); break;
      case 'endGame': this.endGame(); break;
      case 'endHand':
        if (this.poker) { this.poker.forceEndHand(); this.endGame(); }
        else if (this.durak) this.durak.forceEndBout();
        break;
      case 'setMode':
        this.mode = cmd.v;
        if (this.durak) this.durak.mode = cmd.v;
        this.pushLog('Режим: ' + (cmd.v === 'transfer' ? 'переводной' : 'подкидной'));
        this.sendLobby();
        break;
      case 'setBlinds':
        this.sb = Math.max(1, cmd.sb);
        this.bb = Math.max(2, cmd.bb);
        if (this.poker) { this.poker.sb = this.sb; this.poker.bb = this.bb; }
        this.pushLog(`Блайнды ${this.sb}/${this.bb}`);
        this.sendLobby();
        break;
      case 'topUp':
        if (this.poker) {
          for (const s of this.poker.seats) s.chips += 1000;
          this.cb.onToast('Всем добавлено по 1000 фишек', 'ok');
          this.broadcast();
        }
        break;
      default: break;
    }
  }

  /* ---------- авто-ходы ---------- */
  private pump() {
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    if (this.poker) {
      const e = this.poker;
      const betting = ['preflop', 'flop', 'turn', 'river'].includes(e.phase);
      if (betting && e.toAct) {
        const rec = this.seats.find((s) => s.id === e.toAct);
        if (rec?.bot) {
          this.pending = this.schedule(() => {
            const id = e.toAct;
            if (!id) return;
            const d = e.botDecision(id);
            e.act(id, d.a, d.v);
          }, 850 + Math.random() * 650);
        } else if (rec && !rec.connected) {
          this.pending = this.schedule(() => {
            const id = e.toAct;
            const seat = id ? e.seats.find((x) => x.id === id) : null;
            if (!id || !seat) return;
            e.act(id, e.currentBet - seat.bet <= 0 ? 'check' : 'fold');
          }, 1300);
        } else if (rec) {
          const seatName = rec.name;
          this.pending = this.schedule(() => {
            const id = e.toAct;
            const seat = id ? e.seats.find((x) => x.id === id) : null;
            if (!id || !seat) return;
            e.act(id, e.currentBet - seat.bet <= 0 ? 'check' : 'fold');
            this.cb.onToast(`${seatName}: авто-ход по таймеру`, 'info');
          }, 25000);
        }
      }
    } else if (this.durak) {
      const e = this.durak;
      if (e.stage === 'take') {
        const botAtts = [...e.attackers].filter((id) => this.seats.find((s) => s.id === id)?.bot);
        if (botAtts.length) {
          this.pending = this.schedule(() => e.botAct(botAtts[0]), 750);
        } else {
          const def = this.seats.find((s) => s.id === e.defender);
          if (def && (!def.connected || e.seat(def.id)?.out)) {
            this.pending = this.schedule(() => {
              const any = [...e.attackers][0];
              if (any) e.act(any, 'doneTaking');
            }, 1300);
          }
        }
      } else if (e.stage === 'attack') {
        const u = e.unbeaten();
        if (u.length > 0) {
          const def = this.seats.find((s) => s.id === e.defender);
          if (def?.bot) this.pending = this.schedule(() => e.botAct(e.defender!), 850 + Math.random() * 550);
          else if (def && !def.connected) this.pending = this.schedule(() => e.act(e.defender!, 'take'), 1400);
        } else {
          // ход атакующего: первая карта, подкидывание или «бито»
          const att = this.seats.find((s) => s.id === e.attMain);
          if (att?.bot) {
            this.pending = this.schedule(() => e.botAct(e.attMain!), 800 + Math.random() * 500);
          } else if (att && !att.connected) {
            this.pending = this.schedule(() => {
              if (e.table.length > 0) e.act(e.attMain!, 'bito');
              else e.seatOut(e.attMain!);
            }, 1400);
          }
        }
      }
    }
  }

  /* ---------- рассылка ---------- */
  private broadcast() {
    for (const s of this.seats) {
      if (s.bot) continue;
      const view = this.makeView(s.id);
      if (s.isHost) this.cb.onView(view);
      else if (s.connId) this.net?.send(s.connId, { t: 'state', view });
    }
  }

  makeView(forId: string): View {
    const seatsBase = (extra: (s: SeatRec) => Partial<SeatView>) =>
      this.seats.map((s) => ({
        id: s.id, name: s.name, bot: s.bot, connected: s.connected, isHost: s.isHost,
        isYou: s.id === forId, cardCount: 0, ...extra(s),
      } as SeatView));

    if (this.game === 'poker') {
      const e = this.poker;
      const log = this.log.slice(-14);
      if (!e || !this.started) {
        return {
          game: 'poker', phase: 'lobby', seats: seatsBase(() => ({})), community: [], pot: 0,
          currentBet: 0, toAct: null, sb: this.sb, bb: this.bb, dealerSeat: null,
          you: { seatId: forId, hole: [], canAct: false, myBet: 0, chips: 0, callAmount: 0, minRaiseTo: 0, maxRaiseTo: 0 },
          winners: null, matchWinner: null, handNum: 0, log,
        } as PokerView;
      }
      const me = e.seats.find((s) => s.id === forId);
      const pot = e.pot + e.seats.reduce((t, s) => t + s.bet, 0);
      const betting = ['preflop', 'flop', 'turn', 'river'].includes(e.phase);
      const seats = seatsBase((s) => {
        const es = e.seats.find((x) => x.id === s.id);
        if (!es) return {};
        const show = e.phase === 'showdown' && !es.folded && e.winners !== null;
        return {
          cardCount: es.hole.length,
          chips: es.chips, bet: es.bet, folded: es.folded, allIn: es.allIn, out: es.out,
          dealer: e.order[e.dealerIdx] === s.id,
          revealed: show ? es.hole : undefined,
        };
      });
      const myBet = me?.bet ?? 0;
      const chips = me?.chips ?? 0;
      const view: PokerView = {
        game: 'poker',
        phase: e.phase as PokerView['phase'],
        seats,
        community: e.community,
        pot,
        currentBet: e.currentBet,
        toAct: e.toAct,
        sb: e.sb, bb: e.bb,
        dealerSeat: e.order[e.dealerIdx] ?? null,
        you: {
          seatId: forId,
          hole: me?.hole ?? [],
          canAct: betting && e.toAct === forId && !!me && !me.folded && !me.allIn,
          myBet, chips,
          callAmount: Math.max(0, Math.min(e.currentBet - myBet, chips)),
          minRaiseTo: Math.min(e.currentBet + e.minRaise, myBet + chips),
          maxRaiseTo: myBet + chips,
        },
        winners: e.winners,
        matchWinner: e.matchWinner,
        handNum: e.handNum,
        log,
      };
      return view;
    }

    // durak
    const e = this.durak;
    const log = this.log.slice(-14);
    if (!e || !this.started) {
      return {
        game: 'durak', phase: 'lobby', mode: this.mode, seats: seatsBase(() => ({})),
        table: [], trump: null, trumpSuit: null, deckCount: 0, discardCount: 0,
        toAct: null, taking: false, you: { seatId: forId, hand: [], role: null },
        loser: null, draw: false, boutNum: 0, log,
      } as DurakView;
    }
    const me = e.seats.find((s) => s.id === forId);
    const seats = seatsBase((s) => {
      const ds = e.seats.find((x) => x.id === s.id);
      if (!ds) return {};
      return {
        cardCount: ds.hand.length, out: ds.out,
        attacker: e.attackers.has(s.id), defender: e.defender === s.id,
      };
    });
    const toAct = e.stage === 'attack'
      ? (e.unbeaten().length > 0 ? e.defender : e.attMain)
      : e.attMain;
    const view: DurakView = {
      game: 'durak',
      phase: e.stage === 'idle' ? 'lobby' : e.stage === 'done' ? 'done' : 'attack',
      mode: e.mode,
      seats,
      table: e.table.map((p) => ({ a: p.a, d: p.d })),
      trump: e.trump,
      trumpSuit: e.trumpSuit,
      deckCount: e.deck.length,
      discardCount: e.discard,
      toAct,
      taking: e.stage === 'take',
      you: {
        seatId: forId,
        hand: me ? sortHand(me.hand, e.trumpSuit) : [],
        role: e.defender === forId ? 'defend' : e.attackers.has(forId) ? 'attack' : null,
      },
      loser: e.loser,
      draw: e.draw,
      boutNum: e.boutNum,
      log,
    };
    return view;
  }

  leave() {
    if (this.pending) clearTimeout(this.pending);
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.net?.close();
    this.net = null;
  }
}

/* ---------- гость ---------- */
export function createGuestSession(code: string, name: string, cb: RoomCallbacks): SessionHandle {
  let seatId: string | null = null;
  const guest = new GuestNet(code, name, {
    onConnected: () => cb.onToast('Соединение установлено…', 'info'),
    onData: (msg) => {
      switch (msg.t) {
        case 'welcome':
          seatId = msg.seatId;
          cb.onLobby(msg.lobby);
          cb.onToast(`Вы в комнате ${msg.lobby.code}`, 'ok');
          break;
        case 'lobby': cb.onLobby(msg.lobby); break;
        case 'state': cb.onView(msg.view); break;
        case 'ev': cb.onEv(msg.kind); break;
        case 'chat': cb.onChat(msg.from, msg.text, false); break;
        case 'err': cb.onToast(msg.msg, 'err'); break;
        default: break;
      }
    },
    onClose: (kicked) => cb.onLeft(kicked ? 'Вас кикнули из комнаты' : 'Соединение с комнатой потеряно'),
    onError: (m) => cb.onLeft(m),
  });
  const helloTimer = window.setTimeout(() => {
    if (!seatId) cb.onLeft('Не удалось войти в комнату (таймаут)');
  }, 10000);
  const origOnData = cb.onLeft;
  void origOnData;
  return {
    isHost: false,
    action: (a, c, v) => guest.send({ t: 'action', a, c, v }),
    chat: (text) => guest.send({ t: 'chat', from: '', text }),
    admin: () => {},
    leave: () => {
      clearTimeout(helloTimer);
      guest.close();
    },
  };
}
