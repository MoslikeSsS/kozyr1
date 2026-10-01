import { makeDeck, shuffle, sortHand, canBeat, cardPower, cardLabel, lowestCard } from './cards';
import type { Card, DurakMode, DurakPair, DurakView, Suit } from './types';

export type DurakHooks = {
  emit: (kind: string) => void;
  update: () => void;
  schedule: (fn: () => void, ms: number) => number;
  handEnded: () => void;
  log: (s: string) => void;
};

export type DSeat = { id: string; hand: Card[]; out: boolean };

export class DurakEngine {
  seats: DSeat[] = [];
  order: string[] = [];
  deck: Card[] = [];
  trump: Card | null = null;
  trumpSuit: Suit | null = null;
  table: DurakPair[] = [];
  discard = 0;
  attackers = new Set<string>();
  attMain: string | null = null;
  defender: string | null = null;
  stage: 'idle' | 'attack' | 'take' | 'done' = 'idle';
  mode: DurakMode = 'classic';
  boutNum = 0;
  boutCap = 6;
  loser: string | null = null;
  draw = false;
  private timers: number[] = [];

  constructor(private h: DurakHooks) {}

  seat(id: string) { return this.seats.find((s) => s.id === id); }
  private clearTimers() { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; }
  private inGame() { return this.order.filter((id) => !this.seat(id)?.out); }

  private nextInGame(from: string): string | null {
    const ig = this.inGame();
    if (!ig.length) return null;
    const i = ig.indexOf(from);
    return ig[(i + 1) % ig.length];
  }

  newGame(order: string[], mode: DurakMode) {
    this.clearTimers();
    this.order = order.slice();
    this.mode = mode;
    this.seats = order.map((id) => ({ id, hand: [] as Card[], out: false }));
    this.loser = null;
    this.draw = false;
    this.boutNum = 0;
    this.discard = 0;
    this.deck = shuffle(makeDeck(6));
    this.trump = this.deck[0];
    this.trumpSuit = this.trump.s;
    for (let i = 0; i < order.length; i++) {
      for (let k = 0; k < 6; k++) this.seats[i].hand.push(this.deck.pop()!);
    }
    let att = order[0];
    let bestP = 999;
    for (const id of order) {
      for (const c of this.seat(id)!.hand) {
        if (c.s === this.trumpSuit && cardPower(c, this.trumpSuit) < bestP) {
          bestP = cardPower(c, this.trumpSuit);
          att = id;
        }
      }
    }
    this.h.emit('shuffle');
    this.h.emit('deal');
    this.h.log(`Козырь — ${cardLabel(this.trump)}. Первым ходит младший козырь.`);
    this.startBout(att);
  }

  private startBout(attId: string) {
    this.boutNum++;
    this.table = [];
    this.attackers = new Set([attId]);
    this.attMain = attId;
    this.defender = this.nextInGame(attId);
    if (!this.defender || this.defender === attId) { this.stage = 'done'; this.h.update(); return; }
    this.boutCap = Math.min(this.boutNum === 1 ? 5 : 6, Math.max(1, this.seat(this.defender)!.hand.length));
    this.stage = 'attack';
    this.h.emit('turn');
    this.h.update();
  }

  unbeaten(): Card[] { return this.table.filter((p) => p.d === null).map((p) => p.a); }
  tableRanks(): Set<number> { return new Set(this.table.map((p) => p.a.r)); }

  canPlayAttack(id: string, c: Card): boolean {
    if (this.stage !== 'attack' && this.stage !== 'take') return false;
    if (!this.attackers.has(id)) return false;
    const s = this.seat(id);
    if (!s || !s.hand.some((x) => x.r === c.r && x.s === c.s)) return false;
    if (this.stage === 'attack' && this.unbeaten().length > 0) return false;
    if (this.table.length >= this.boutCap) return false;
    if (this.table.length === 0) return true;
    return this.tableRanks().has(c.r);
  }

  canTransfer(id: string, c: Card): boolean {
    if (this.mode !== 'transfer') return false;
    if (this.stage !== 'attack' || this.defender !==id) return false;
    const s = this.seat(id);
    if (!s || !s.hand.some((x) => x.r === c.r && x.s === c.s)) return false;
    const ranks = this.tableRanks();
    if (ranks.size !== 1 || !ranks.has(c.r)) return false;
    if (this.table.some((p) => p.d !== null)) return false;
    const next = this.nextInGame(id);
    if (!next || next === id) return false;
    return this.seat(next)!.hand.length >= this.table.length + 1;
  }

  beatersIn(id: string, attack: Card): Card[] {
    const s = this.seat(id);
    const trump = this.trumpSuit;
    if (!s || trump === null) return [];
    return s.hand.filter((c) => canBeat(attack, c, trump));
  }

  act(id: string, a: 'attack' | 'beat' | 'take' | 'transfer' | 'bito' | 'doneTaking', c?: Card) {
    if (this.stage !== 'attack' && this.stage !== 'take') return;
    const s = this.seat(id);
    if (!s) return;
    const remove = (card: Card) => { s.hand = s.hand.filter((x) => !(x.r === card.r && x.s === card.s)); };

    if (a === 'attack') {
      if (!c || !this.canPlayAttack(id, c)) return;
      remove(c);
      this.table.push({ a: c, d: null });
      this.h.emit('deal');
      this.h.update();
    } else if (a === 'beat') {
      const trump = this.trumpSuit;
      if (this.stage !== 'attack' || this.defender !== id || !c || trump === null) return;
      const pair = this.table.find((p) => p.d === null);
      if (!pair || !canBeat(pair.a, c, trump)) return;
      remove(c);
      pair.d = c;
      this.h.emit('hit');
      this.h.update();
    } else if (a === 'take') {
      if (this.stage !== 'attack' || this.defender !== id) return;
      this.stage = 'take';
      this.h.emit('take');
      this.h.log(`${id} берёт карты`);
      this.h.update();
    } else if (a === 'transfer') {
      if (!c || !this.canTransfer(id, c)) return;
      remove(c);
      this.table.push({ a: c, d: null });
      this.attackers.add(id);
      this.defender = this.nextInGame(id)!;
      this.boutCap = Math.min(this.boutCap, Math.max(1, this.seat(this.defender)!.hand.length));
      this.h.emit('transfer');
      this.h.log('Перевод хода!');
      this.h.update();
    } else if (a === 'bito') {
      if (this.stage !== 'attack' || !this.attackers.has(id)) return;
      if (this.unbeaten().length > 0 || this.table.length === 0) return;
      this.discard += this.table.length * 2;
      this.table = [];
      this.h.emit('bito');
      this.h.log('Бито! Карты уходят в отбой.');
      this.endBout(false);
    } else if (a === 'doneTaking') {
      if (this.stage !== 'take' || !this.attackers.has(id) || !this.defender) return;
      const def = this.seat(this.defender)!;
      for (const p of this.table) { def.hand.push(p.a); if (p.d) def.hand.push(p.d); }
      this.h.log(`Взято ${this.table.length * 2} карт.`);
      this.table = [];
      this.h.emit('deal');
      this.endBout(true);
    }
  }

  private endBout(taken: boolean) {
    const defId = this.defender!;
    const ig = this.inGame();
    const seq: string[] = [];
    const start = this.attMain && ig.includes(this.attMain) ? this.attMain : ig[0];
    const i0 = ig.indexOf(start);
    for (let k = 0; k < ig.length; k++) {
      const id = ig[(i0 + k) % ig.length];
      if (id !== defId) seq.push(id);
    }
    if (ig.includes(defId)) seq.push(defId);
    let drew = 0;
    for (const id of seq) {
      const s = this.seat(id)!;
      while (s.hand.length < 6 && this.deck.length > 0) { s.hand.push(this.deck.pop()!); drew++; }
    }
    if (drew > 0) this.h.emit('deal');
    if (this.deck.length === 0) {
      for (const id of ig) if (this.seat(id)!.hand.length === 0) this.seat(id)!.out = true;
    }
    const left = this.inGame();
    if (left.length <= 1) {
      this.stage = 'done';
      this.draw = left.length === 0;
      this.loser = left[0] ?? null;
      this.h.emit(left.length === 1 ? 'lose' : 'win');
      this.h.log(this.draw ? 'Ничья — все вышли одновременно!' : 'Игра окончена.');
      this.h.update();
      this.timers.push(this.h.schedule(() => this.h.handEnded(), 6000));
      return;
    }
    let att: string;
    if (!taken) {
      att = defId;
    } else {
      att = this.nextInGame(defId) ?? defId;
    }
    if (this.seat(att)?.out) att = this.nextInGame(att) ?? defId;
    if (this.seat(att)!.hand.length === 0 && this.deck.length === 0) att = this.nextInGame(att) ?? att;
    this.startBout(att);
  }

  seatOut(id: string) {
    const s = this.seat(id);
    if (!s) return;
    s.out = true;
    if (this.stage === 'attack' || this.stage === 'take') {
      if (this.defender === id) {
        if (this.attackers.size > 0) {
          if (this.stage === 'attack') this.stage = 'take';
          this.act([...this.attackers][0], 'doneTaking');
        } else {
          for (const p of this.table) { s.hand.push(p.a); if (p.d) s.hand.push(p.d); }
          this.table = [];
          this.endBout(true);
        }
        return;
      }
      if (this.attackers.has(id)) {
        this.attackers.delete(id);
        if (this.attMain === id) this.attMain = [...this.attackers][0] ?? null;
        if (this.attackers.size === 0) {
          if (this.unbeaten().length === 0 && this.table.length > 0) {
            this.discard += this.table.length * 2;
            this.table = [];
            this.endBout(false);
          } else {
            const def = this.seat(this.defender!)!;
            for (const p of this.table) { def.hand.push(p.a); if (p.d) def.hand.push(p.d); }
            this.table = [];
            this.endBout(true);
          }
          return;
        }
      }
    }
    this.h.update();
  }

  forceEndBout() {
    this.clearTimers();
    if (this.stage === 'attack' || this.stage === 'take') {
      this.discard += this.table.reduce((t, p) => t + (p.d ? 2 : 1), 0);
      this.table = [];
      this.stage = 'attack';
      this.endBout(false);
    }
  }

  /* ---------- бот ---------- */
  botAct(id: string): boolean {
    const s = this.seat(id);
    if (!s || this.trumpSuit === null) return false;
    const trump = this.trumpSuit;
    if (this.stage === 'take') {
      if (!this.attackers.has(id)) return false;
      const c = this.botAttackCard(id);
      if (c) { this.act(id, 'attack', c); return true; }
      this.act(id, 'doneTaking');
      return true;
    }
    if (this.stage !== 'attack') return false;
    if (this.defender === id) {
      const u = this.unbeaten();
      if (!u.length) return false;
      if (this.mode === 'transfer' && this.table.every((p) => p.d === null)) {
        const ranks = this.tableRanks();
        if (ranks.size === 1) {
          const r = [...ranks][0];
          const tr = s.hand.find((c) => c.r === r);
          if (tr && this.canTransfer(id, tr)) {
            const beaters = this.beatersIn(id, u[0]);
            const cheap = beaters.length > 0 && cardPower(sortHand(beaters, trump)[0], trump) <= 11;
            if (beaters.length === 0 || !cheap || Math.random() < 0.35) {
              this.act(id, 'transfer', tr);
              return true;
            }
          }
        }
      }
      const beaters = sortHand(this.beatersIn(id, u[0]), trump);
      if (beaters.length) { this.act(id, 'beat', beaters[0]); return true; }
      this.act(id, 'take');
      return true;
    }
    if (this.attackers.has(id)) {
      if (this.unbeaten().length > 0) return false;
      const c = this.botAttackCard(id);
      if (c) { this.act(id, 'attack', c); return true; }
      if (this.table.length > 0) { this.act(id, 'bito'); return true; }
      return false;
    }
    return false;
  }

  private botAttackCard(id: string): Card | null {
    const s = this.seat(id)!;
    const trump = this.trumpSuit;
    if (this.table.length === 0) {
      if (!s.hand.length) return null;
      return lowestCard(s.hand, trump);
    }
    if (this.table.length >= this.boutCap) return null;
    const ranks = this.tableRanks();
    const opts = s.hand
      .filter((c) => ranks.has(c.r))
      .sort((a, b) => cardPower(a, trump) - cardPower(b, trump));
    if (!opts.length) return null;
    const c = opts[0];
    if (c.s === trump && c.r >= 13 && this.stage === 'attack' && Math.random() < 0.6) return null;
    return c;
  }
}

/* ---------- клиентские подсказки ---------- */
export function durakHints(v: DurakView): { beat: number[]; transfer: number[]; play: number[] } {
  const beat: number[] = [];
  const transfer: number[] = [];
  const play: number[] = [];
  const hand = v.you.hand;
  const trump = v.trumpSuit;
  if (v.phase !== 'attack' || trump === null) return { beat, transfer, play };
  if (v.you.role === 'defend' && !v.taking) {
    const unbeaten = v.table.filter((p) => p.d === null);
    if (unbeaten.length) {
      const target = unbeaten[0].a;
      hand.forEach((c, i) => { if (canBeat(target, c, trump)) beat.push(i); });
      if (v.mode === 'transfer' && v.table.every((p) => p.d === null)) {
        const ranks = new Set(v.table.map((p) => p.a.r));
        if (ranks.size === 1) {
          const r = [...ranks][0];
          const ig = v.seats.filter((s) => !s.out);
          const idx = ig.findIndex((s) => s.isYou);
          const next = ig[(idx + 1) % ig.length];
          if (next && !next.isYou && next.cardCount >= v.table.length + 1) {
            hand.forEach((c, i) => { if (c.r === r) transfer.push(i); });
          }
        }
      }
    }
  }
  if (v.you.role === 'attack') {
    const allBeaten = v.table.every((p) => p.d !== null);
    if (v.taking || allBeaten) {
      const ranks = new Set(v.table.map((p) => p.a.r));
      hand.forEach((c, i) => {
        if (v.table.length === 0 || ranks.has(c.r)) play.push(i);
      });
    }
  }
  return { beat, transfer, play };
}

export function durakStatusText(v: DurakView, names: Record<string, string>): string {
  if (v.phase === 'done') {
    if (v.draw) return 'Ничья!';
    return v.loser ? `Дурак — ${names[v.loser] ?? '…'}` : '';
  }
  if (v.phase !== 'attack') return '';
  const n = (id: string | null) => (id ? names[id] ?? '…' : '…');
  if (v.taking) return `${n(v.toAct)} подкидывает карты перед взятием…`;
  const unbeaten = v.table.filter((p) => p.d === null).length;
  if (unbeaten > 0) return `${n(v.seats.find((s) => s.defender)?.id ?? null)} отбивается…`;
  return `${n(v.seats.find((s) => s.attacker)?.id ?? null)} подкидывает или говорит «Бито»…`;
}
