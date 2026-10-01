import { makeDeck, shuffle } from './cards';
import type { Card, PokerWinner } from './types';

export const HAND_NAMES = [
  'Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит',
  'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш',
];

const GEN: Record<number, string> = {
  2: 'двойки', 3: 'тройки', 4: 'четвёрки', 5: 'пятёрки', 6: 'шестёрки',
  7: 'семёрки', 8: 'восьмёрки', 9: 'девятки', 10: 'десятки', 11: 'валета',
  12: 'дамы', 13: 'короля', 14: 'туза',
};
const GENPL: Record<number, string> = {
  2: 'двоек', 3: 'троек', 4: 'четвёрок', 5: 'пятёрок', 6: 'шестёрок',
  7: 'семёрок', 8: 'восьмёрок', 9: 'девяток', 10: 'десяток', 11: 'валетов',
  12: 'дам', 13: 'королей', 14: 'тузов',
};
const SUIT_GEN = ['пик', 'червей', 'бубен', 'треф'];

export type HandResult = { cat: number; score: number[]; name: string; cards: Card[] };

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function eval5(cs: Card[]): HandResult {
  const rs = cs.map((c) => c.r).sort((a, b) => b - a);
  const flush = cs.every((c) => c.s === cs[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }
  const counts = new Map<number, number>();
  rs.forEach((r) => counts.set(r, (counts.get(r) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const mk = (cat: number, tb: number[]): HandResult => ({
    cat, score: [cat, ...tb], name: HAND_NAMES[cat], cards: cs,
  });
  if (flush && straightHigh) return mk(8, [straightHigh]);
  if (groups[0][1] === 4) return mk(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return mk(6, [groups[0][0], groups[1][0]]);
  if (flush) return mk(5, rs);
  if (straightHigh) return mk(4, [straightHigh]);
  if (groups[0][1] === 3) return mk(3, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2) return mk(2, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2) return mk(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return mk(0, rs);
}

export function bestHand(cards: Card[]): HandResult {
  let best: HandResult | null = null;
  const combo: Card[] = [];
  const rec = (start: number) => {
    if (combo.length === 5) {
      const res = eval5(combo.slice());
      if (!best || cmp(res.score, best.score) > 0) best = res;
      return;
    }
    for (let i = start; i <= cards.length - (5 - combo.length); i++) {
      combo.push(cards[i]);
      rec(i + 1);
      combo.pop();
    }
  };
  rec(0);
  return best!;
}

export function describeHand(res: HandResult): string {
  const p = res.score[1];
  switch (res.cat) {
    case 0: return 'Старшая — ' + GEN[p];
    case 1: return 'Пара ' + GENPL[p];
    case 2: return `Две пары: ${GENPL[res.score[1]]} и ${GENPL[res.score[2]]}`;
    case 3: return 'Тройка ' + GENPL[p];
    case 4: return p === 5 ? 'Стрит «колесо» (Т–5)' : 'Стрит до ' + GEN[p];
    case 5: return 'Флеш ' + SUIT_GEN[res.cards[0].s];
    case 6: return `Фулл-хаус: ${GENPL[res.score[1]]} на ${GENPL[res.score[2]]}`;
    case 7: return 'Каре ' + GENPL[p];
    case 8: return p === 5 ? 'Стрит-флеш «стальное колесо»' : 'Стрит-флеш до ' + GEN[p];
    default: return res.name;
  }
}

export function chenScore(hole: Card[]): number {
  if (hole.length < 2) return 0;
  const [a, b] = hole;
  const val = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let score = Math.max(val(a.r), val(b.r));
  if (a.r === b.r) score = Math.max(5, score * 2);
  if (a.s === b.s) score += 2;
  const gap = Math.abs(a.r - b.r) - 1;
  if (a.r !== b.r) {
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && a.r < 12 && b.r < 12) score += 1;
  }
  return score;
}

export function chenLabel(score: number): string {
  if (score >= 9) return 'Премиум-рука — рейзите';
  if (score >= 7) return 'Очень сильная рука';
  if (score >= 5) return 'Сильная рука';
  if (score >= 3) return 'Средняя рука — осторожно';
  if (score >= 1) return 'Слабая рука';
  return 'Мусор — лучше сбросить';
}

/* ================= движок ================= */

export type EngineHooks = {
  emit: (kind: string) => void;
  update: () => void;
  schedule: (fn: () => void, ms: number) => number;
  handEnded: () => void;
};

export type PSeat = {
  id: string; chips: number; hole: Card[]; bet: number; totalBet: number;
  folded: boolean; allIn: boolean; out: boolean;
};

const BETTING = ['preflop', 'flop', 'turn', 'river'];

export class PokerEngine {
  seats: PSeat[] = [];
  order: string[] = [];
  deck: Card[] = [];
  community: Card[] = [];
  pot = 0;
  currentBet = 0;
  minRaise = 0;
  phase: 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' = 'idle';
  toAct: string | null = null;
  needAct = new Set<string>();
  dealerIdx = -1;
  sb = 10;
  bb = 20;
  winners: PokerWinner[] | null = null;
  matchWinner: string | null = null;
  handNum = 0;
  private timers: number[] = [];

  constructor(private h: EngineHooks) {}

  private seat(id: string) { return this.seats.find((s) => s.id === id); }
  private alive() { return this.order.map((id) => this.seat(id)).filter((s): s is PSeat => !!s && !s.folded); }
  private contenders() { return this.alive().filter((s) => !s.allIn); }
  private clearTimers() { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; }

  nextHand(order: string[], defaultChips: number) {
    this.clearTimers();
    for (const id of order) {
      if (!this.seats.some((s) => s.id === id)) {
        this.seats.push({ id, chips: defaultChips, hole: [], bet: 0, totalBet: 0, folded: false, allIn: false, out: false });
      }
    }
    this.seats = this.seats.filter((s) => order.includes(s.id));
    for (const s of this.seats) if (s.chips <= 0) s.out = true;
    let inGame = order.filter((id) => { const s = this.seat(id); return s && !s.out; });
    if (inGame.length < 2) {
      this.phase = 'idle';
      const w = this.seats.filter((s) => !s.out).sort((a, b) => b.chips - a.chips)[0];
      this.matchWinner = w ? w.id : null;
      this.h.update();
      return;
    }
    this.order = inGame;
    this.handNum++;
    this.winners = null;
    this.pot = 0;
    this.community = [];
    this.deck = shuffle(makeDeck(2));
    for (const s of this.seats) { s.hole = []; s.bet = 0; s.totalBet = 0; s.folded = s.out; s.allIn = false; }
    const n = this.order.length;
    this.dealerIdx = (this.dealerIdx + 1) % n;
    const sbIdx = n === 2 ? this.dealerIdx : (this.dealerIdx + 1) % n;
    const bbIdx = n === 2 ? (this.dealerIdx + 1) % n : (this.dealerIdx + 2) % n;
    const post = (idx: number, amount: number) => {
      const s = this.seat(this.order[idx])!;
      const pay = Math.min(amount, s.chips);
      s.chips -= pay; s.bet = pay; s.totalBet = pay;
      if (s.chips === 0) s.allIn = true;
      return pay;
    };
    const sbPaid = post(sbIdx, this.sb);
    const bbPaid = post(bbIdx, this.bb);
    this.currentBet = Math.max(sbPaid, bbPaid);
    this.minRaise = this.bb;
    this.h.emit('shuffle');
    for (const id of this.order) {
      const s = this.seat(id)!;
      s.hole = [this.deck.pop()!, this.deck.pop()!];
    }
    this.h.emit('deal');
    this.phase = 'preflop';
    this.needAct = new Set(this.contenders().map((s) => s.id));
    if (this.needAct.size === 0) { this.progress(); return; }
    this.toAct = this.nextNeedAct(this.order[bbIdx]);
    this.h.emit('turn');
    this.h.update();
  }

  act(seatId: string, a: 'fold' | 'check' | 'call' | 'raise', v?: number) {
    if (!BETTING.includes(this.phase)) return;
    if (this.toAct !== seatId) return;
    const s = this.seat(seatId);
    if (!s || s.folded || s.allIn) return;
    const toCall = this.currentBet - s.bet;
    if (a === 'fold') {
      s.folded = true;
      this.h.emit('fold');
    } else if (a === 'check') {
      if (toCall > 0) return;
      this.h.emit('click' as string);
    } else if (a === 'call') {
      const pay = Math.min(toCall, s.chips);
      s.chips -= pay; s.bet += pay; s.totalBet += pay;
      if (s.chips === 0) s.allIn = true;
      this.h.emit(s.allIn ? 'hit' : 'chip');
    } else if (a === 'raise') {
      const maxTo = s.bet + s.chips;
      let target = Math.min(v ?? this.currentBet + this.minRaise, maxTo);
      const minTo = this.currentBet + this.minRaise;
      if (target < minTo && target < maxTo) target = Math.min(minTo, maxTo);
      const pay = target - s.bet;
      s.chips -= pay; s.bet = target; s.totalBet += pay;
      if (s.chips === 0) s.allIn = true;
      const inc = target - this.currentBet;
      if (inc >= this.minRaise) {
        this.minRaise = inc;
        this.currentBet = target;
        this.needAct = new Set(this.contenders().filter((c) => c.id !== seatId).map((c) => c.id));
      } else if (target > this.currentBet) {
        this.currentBet = target;
      }
      this.h.emit(s.allIn ? 'hit' : 'bet');
    }
    this.needAct.delete(seatId);
    this.toAct = null;
    this.progress(seatId);
  }

  private nextNeedAct(from: string | null): string {
    const n = this.order.length;
    const start = from ? this.order.indexOf(from) : this.dealerIdx;
    for (let i = 1; i <= n; i++) {
      const id = this.order[(start + i) % n];
      if (this.needAct.has(id)) return id;
    }
    return this.order[0];
  }

  private progress(fromActor: string | null = null) {
    const alive = this.alive();
    if (alive.length === 1) {
      const w = alive[0];
      this.pot += this.seats.reduce((t, s) => t + s.bet, 0);
      for (const s of this.seats) s.bet = 0;
      w.chips += this.pot;
      this.winners = [{ seatId: w.id, amount: this.pot, handName: 'Соперники сбросили', cards: [] }];
      this.pot = 0;
      this.phase = 'showdown';
      this.toAct = null;
      this.h.emit('win');
      this.h.update();
      this.timers.push(this.h.schedule(() => this.h.handEnded(), 4600));
      return;
    }
    if (this.needAct.size > 0) {
      this.toAct = this.nextNeedAct(fromActor ?? this.toAct);
      this.h.emit('turn');
      this.h.update();
      return;
    }
    this.pot += this.seats.reduce((t, s) => t + s.bet, 0);
    for (const s of this.seats) s.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    const cont = this.contenders();
    if (this.phase === 'river' || cont.length <= 1) {
      while (this.community.length < 5) this.community.push(this.deck.pop()!);
      this.h.emit('deal');
      this.showdown();
      return;
    }
    if (this.phase === 'preflop') { this.phase = 'flop'; this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!); }
    else if (this.phase === 'flop') { this.phase = 'turn'; this.community.push(this.deck.pop()!); }
    else if (this.phase === 'turn') { this.phase = 'river'; this.community.push(this.deck.pop()!); }
    this.h.emit('deal');
    this.needAct = new Set(cont.map((s) => s.id));
    this.toAct = this.nextNeedAct(this.order[this.dealerIdx]);
    this.h.emit('turn');
    this.h.update();
  }

  private showdown() {
    this.phase = 'showdown';
    this.toAct = null;
    const alive = this.alive();
    const results = new Map<string, HandResult>();
    for (const s of alive) results.set(s.id, bestHand([...s.hole, ...this.community]));
    const contribs = this.seats.filter((s) => s.totalBet > 0).map((s) => ({ id: s.id, amt: s.totalBet, folded: s.folded }));
    const pots = this.calcPots(contribs);
    const agg = new Map<string, PokerWinner>();
    for (const pot of pots) {
      const elig = pot.eligible.filter((id) => results.has(id));
      if (!elig.length) continue;
      let best: HandResult | null = null;
      let bestIds: string[] = [];
      for (const id of elig) {
        const r = results.get(id)!;
        if (!best || cmp(r.score, best.score) > 0) { best = r; bestIds = [id]; }
        else if (cmp(r.score, best.score) === 0) bestIds.push(id);
      }
      const base = Math.floor(pot.amount / bestIds.length);
      let rem = pot.amount - base * bestIds.length;
      for (const id of bestIds) {
        const extra = rem > 0 ? 1 : 0;
        rem -= extra;
        const cur = agg.get(id);
        if (cur) cur.amount += base + extra;
        else agg.set(id, { seatId: id, amount: base + extra, handName: describeHand(best!), cards: best!.cards });
        const s = this.seat(id)!;
        s.chips += base + extra;
      }
    }
    this.winners = [...agg.values()];
    this.h.emit('bigwin');
    this.h.update();
    this.timers.push(this.h.schedule(() => this.h.handEnded(), 5600));
  }

  private calcPots(contribs: { id: string; amt: number; folded: boolean }[]) {
    const levels = [...new Set(contribs.map((c) => c.amt))].sort((a, b) => a - b);
    const pots: { amount: number; eligible: string[] }[] = [];
    let prev = 0;
    for (const lvl of levels) {
      const inc = lvl - prev;
      prev = lvl;
      if (inc <= 0) continue;
      const contributors = contribs.filter((c) => c.amt >= lvl);
      pots.push({
        amount: inc * contributors.length,
        eligible: contributors.filter((c) => !c.folded).map((c) => c.id),
      });
    }
    return pots;
  }

  seatOut(id: string) {
    const s = this.seat(id);
    if (!s) return;
    s.out = true;
    if (BETTING.includes(this.phase) && !s.folded) {
      s.folded = true;
      this.needAct.delete(id);
      if (this.toAct === id) { this.toAct = null; this.progress(id); return; }
      if (this.alive().length === 1) { this.needAct.clear(); this.progress(id); return; }
    }
    this.h.update();
  }

  forceEndHand() {
    this.clearTimers();
    for (const s of this.seats) { s.chips += s.bet; s.bet = 0; }
    this.pot = 0;
    this.phase = 'idle';
    this.toAct = null;
    this.winners = null;
    this.h.update();
  }

  botDecision(id: string): { a: 'fold' | 'check' | 'call' | 'raise'; v?: number } {
    const s = this.seat(id);
    if (!s) return { a: 'fold' };
    const toCall = this.currentBet - s.bet;
    const maxTo = s.bet + s.chips;
    const rand = Math.random();
    const potNow = this.pot + this.seats.reduce((t, x) => t + x.bet, 0);
    const raiseTo = Math.min(this.currentBet + Math.max(this.minRaise, Math.round(potNow * 0.6)), maxTo);
    if (this.phase === 'preflop') {
      const chen = chenScore(s.hole);
      if (chen >= 8) return { a: 'raise', v: Math.min(this.currentBet + this.minRaise * 2 + this.bb, maxTo) };
      if (chen >= 5 && toCall <= this.bb * 3) return toCall <= 0 ? { a: 'check' } : { a: 'call' };
      if (chen >= 3.5 && toCall <= this.bb) return toCall <= 0 ? { a: 'check' } : { a: 'call' };
      if (toCall === 0) return rand < 0.15 ? { a: 'raise', v: Math.min(this.currentBet + this.minRaise, maxTo) } : { a: 'check' };
      if (toCall <= this.bb && rand < 0.4) return { a: 'call' };
      return { a: 'fold' };
    }
    const res = bestHand([...s.hole, ...this.community]);
    const strength = res.cat + (res.score[1] || 0) / 15;
    if (toCall === 0) {
      if (strength >= 3 || rand < 0.12) return { a: 'raise', v: raiseTo };
      return { a: 'check' };
    }
    if (strength >= 5) return { a: 'raise', v: raiseTo };
    if (strength >= 2 && toCall <= Math.max(potNow * 0.5, this.bb * 2)) return { a: 'call' };
    if (strength >= 1 && toCall <= this.bb * 2) return { a: 'call' };
    if (rand < 0.07) return { a: 'call' };
    return { a: 'fold' };
  }
}

export function pokerLive(hole: Card[], community: Card[]): HandResult | null {
  if (hole.length < 2 || hole.length + community.length < 5) return null;
  return bestHand([...hole, ...community]);
}
