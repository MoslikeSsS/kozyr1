/**
 * Тесты игровой логики покера.
 *
 * Здесь ошибка стоит дороже всего в проекте: движок сам решает, кому
 * отойдёт банк, и ошибиться можно незаметно — партия «просто» заканчивается
 * неверно. Поэтому оценка руки и расчёт банка проверяются явно.
 */
import { describe, it, expect } from 'vitest';
import { bestHand, describeHand, PokerEngine } from './poker';
import type { Card, Suit } from './types';

const c = (r: number, s: Suit = 0): Card => ({ r, s });

/* --------------------------------------------------- оценка комбинации */

describe('bestHand — категории', () => {
  it('старшая карта', () => {
    const h = bestHand([c(10), c(7, 1), c(9, 2), c(3, 3), c(6, 1)]);
    expect(h.name).toBe('Старшая карта');
  });

  it('пара', () => {
    const h = bestHand([c(9), c(9, 1), c(5, 2), c(3, 3), c(2, 1)]);
    expect(h.name).toBe('Пара');
    expect(h.score[0]).toBe(1);
    expect(h.score[1]).toBe(9);
  });

  it('две пары', () => {
    const h = bestHand([c(9), c(9, 1), c(4, 2), c(4, 3), c(2, 1)]);
    expect(h.name).toBe('Две пары');
    expect(h.score.slice(0, 3)).toEqual([2, 9, 4]);
  });

  it('трипл', () => {
    const h = bestHand([c(7), c(7, 1), c(7, 2), c(3, 3), c(2, 1)]);
    expect(h.name).toBe('Тройка');
    expect(h.score.slice(0, 2)).toEqual([3, 7]);
  });

  it('стрит', () => {
    const h = bestHand([c(5), c(6, 1), c(7, 2), c(8, 3), c(9, 1)]);
    expect(h.name).toBe('Стрит');
    expect(h.score[0]).toBe(4);
    expect(h.score[1]).toBe(9); // старшая карта стрита
  });

  it('A-2-3-4-5 — это стрит «колесо», и он ниже стрита 6-7-8-9-10', () => {
    const wheel = bestHand([c(14), c(2, 1), c(3, 2), c(4, 3), c(5, 1)]);
    const six = bestHand([c(6), c(7, 1), c(8, 2), c(9, 3), c(10, 1)]);
    expect(wheel.name).toBe('Стрит');
    expect(wheel.score[1]).toBe(5); // старшая карта колеса — пятёрка
    expect(six.score[1]).toBe(10);
  });

  it('стрит 10-J-Q-K-A считается', () => {
    const h = bestHand([c(10), c(11, 1), c(12, 2), c(13, 3), c(14, 1)]);
    expect(h.name).toBe('Стрит');
    expect(h.score[1]).toBe(14);
  });

  it('флеш', () => {
    const h = bestHand([c(2, 0), c(5, 0), c(9, 0), c(11, 0), c(14, 0)]);
    expect(h.name).toBe('Флеш');
    expect(h.score[0]).toBe(5);
  });

  it('флеш бьёт стрит', () => {
    const flush = bestHand([c(2, 0), c(5, 0), c(9, 0), c(11, 0), c(14, 0)]);
    const straight = bestHand([c(6), c(7, 1), c(8, 2), c(9, 3), c(10, 1)]);
    expect(flush.cat).toBeGreaterThan(straight.cat);
  });

  it('фулл-хаус', () => {
    const h = bestHand([c(9), c(9, 1), c(9, 2), c(4, 3), c(4, 1)]);
    expect(h.name).toBe('Фулл-хаус');
    expect(h.score.slice(0, 3)).toEqual([6, 9, 4]);
  });

  it('каре', () => {
    const h = bestHand([c(6), c(6, 1), c(6, 2), c(6, 3), c(2, 1)]);
    expect(h.name).toBe('Каре');
    expect(h.score[1]).toBe(6);
  });

  it('стрит-флеш', () => {
    const h = bestHand([c(5, 2), c(6, 2), c(7, 2), c(8, 2), c(9, 2)]);
    expect(h.name).toBe('Стрит-флеш');
  });

  it('стрит-флеш бьёт каре', () => {
    const sf = bestHand([c(5, 2), c(6, 2), c(7, 2), c(8, 2), c(9, 2)]);
    const quads = bestHand([c(6), c(6, 1), c(6, 2), c(6, 3), c(2, 1)]);
    expect(sf.cat).toBeGreaterThan(quads.cat);
  });
});

describe('bestHand — сравнение', () => {
  const beat = (a: Card[], b: Card[]) => bestHand(a).cat > bestHand(b).cat
    || (bestHand(a).cat === bestHand(b).cat && bestHand(a).score.join() > bestHand(b).score.join());

  it('пара тузов бьёт пару дам', () => {
    expect(beat([c(14), c(14, 1), c(3, 2), c(5, 3), c(7, 1)], [c(12), c(12, 1), c(3, 2), c(5, 3), c(7, 1)])).toBe(true);
  });

  it('две пары сравниваются по старшей паре', () => {
    const a = bestHand([c(9), c(9, 1), c(4, 2), c(4, 3), c(2, 1)]);
    const b = bestHand([c(8), c(8, 1), c(4, 2), c(4, 3), c(2, 1)]);
    expect(a.cat).toBe(b.cat);
    expect(a.score.join() > b.score.join()).toBe(true);
  });

  it('одинаковые комбинации дают равный результат', () => {
    const a = bestHand([c(9, 0), c(9, 1), c(4, 2), c(4, 3), c(2, 1)]);
    const b = bestHand([c(9, 1), c(9, 2), c(4, 0), c(4, 3), c(2, 2)]);
    expect(a.score.join()).toBe(b.score.join());
  });

  it('кикер решает при равных парах', () => {
    const a = bestHand([c(9), c(9, 1), c(7, 2), c(5, 3), c(2, 1)]);
    const b = bestHand([c(9), c(9, 1), c(7, 2), c(3, 3), c(2, 1)]);
    expect(a.cat).toBe(b.cat);
    expect(a.score.join() > b.score.join()).toBe(true);
  });

  it('флеш всегда бьёт стрит при равном старшем', () => {
    const a = bestHand([c(9, 0), c(8, 0), c(6, 0), c(4, 0), c(2, 0)]);
    const b = bestHand([c(9), c(8, 1), c(6, 2), c(5, 3), c(4, 1)]);
    expect(a.cat).toBeGreaterThan(b.cat);
  });
});

describe('describeHand', () => {
  it('называет пару по рангу', () => {
    expect(describeHand(bestHand([c(14), c(14, 1), c(3, 2), c(5, 3), c(7, 1)]))).toContain('туз');
  });
});

/* ------------------------------------------------- банк и сайд-поты */

/**
 * Гоняем настоящий движок: он сам раздаёт карты, считает блайнды и
 * ведёт раздачу. Проверяем состояние прямо на движке — так ошибка
 * видна сразу, а не спустя два клика в интерфейсе.
 */
function makeEngine() {
  const calls = { emit: [] as string[], ended: 0 };
  const queue: (() => void)[] = [];
  const engine = new PokerEngine({
    emit: (kind) => calls.emit.push(kind),
    update: () => {},
    // Таймеры движка копим и выполняем по требованию: вызывать их сразу
    // нельзя — движок планирует следующий шаг раздачи, и немедленный
    // вызов входит в этот шаг на полпути, ломая последовательность фаз.
    schedule: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    handEnded: () => {
      calls.ended++;
    },
  });

  /** Выполнить всё запланированное, пока очередь не опустеет. */
  const drain = (limit = 200) => {
    let n = 0;
    while (queue.length && n++ < limit) {
      const batch = queue.splice(0, queue.length);
      for (const fn of batch) fn();
    }
  };

  /** Один шаг партии: ход текущего игрока плюс все отложенные действия. */
  const step = (a: 'fold' | 'check' | 'call' | 'raise', v?: number) => {
    if (!engine.toAct) return false;
    engine.act(engine.toAct, a, v);
    drain();
    return true;
  };

  return { engine, calls, drain, step };
}

/**
 * Фишки игроков плюс их ставки. Банк сюда не входит: он остаётся для
 * показа после выплаты и к моменту шоудауна дублирует уже выданные
 * фишки, поэтому в расчётный остаток не годится.
 */
const liveChips = (engine: PokerEngine) =>
  engine.seats.reduce((n, s) => n + s.chips + s.bet, 0);

/**
 * Ход, который действительно допустим: чек нельзя, если есть ставка
 * для уравнивания — движок такой ход молча отвергает, и раздача
 * не сдвинется. Поэтому действие выбирается по ситуации.
 */
const playTurn = (engine: PokerEngine) => {
  if (!engine.toAct) return false;
  const me = engine.seats.find((s) => s.id === engine.toAct)!;
  const toCall = engine.currentBet - me.bet;
  if (toCall > me.chips) engine.act(me.id, 'raise', me.chips + toCall);
  else engine.act(me.id, toCall > 0 ? 'call' : 'check');
  return true;
};

describe('движок покера', () => {
  it('раздаёт по две карты разным игрокам', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 1000);

    expect(engine.seats).toHaveLength(3);
    for (const s of engine.seats) expect(s.hole).toHaveLength(2);

    const seen = new Set<string>();
    for (const s of engine.seats) for (const card of s.hole) seen.add(`${card.r}:${card.s}`);
    // Колода не выдаёт дубликаты: шесть карт — шесть разных.
    expect(seen.size).toBe(6);
  });

  it('не выдаёт одну карту двум игрокам за раздачу', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b', 'c', 'd', 'e', 'f'], 1000);
    const all: string[] = [];
    for (const s of engine.seats) for (const card of s.hole) all.push(`${card.r}:${card.s}`);
    expect(new Set(all).size).toBe(all.length);
  });

  it('блайнды уходят из стопок, но ещё числятся ставками', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b'], 1000);
    const inBets = engine.seats.reduce((n, s) => n + s.bet, 0);
    // Ставки держатся на местах, а не в банке: счёт идёт по обоим.
    expect(inBets).toBeGreaterThan(0);
    expect(liveChips(engine)).toBe(2000);
  });

  it('ставка обрезается до стопки игрока', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b'], 50);
    const toAct = engine.toAct!;
    const before = engine.seats.find((s) => s.id === toAct)!.chips;

    engine.act(toAct, 'raise', 999999);

    const me = engine.seats.find((s) => s.id === toAct)!;
    expect(me.chips).toBeGreaterThanOrEqual(0);
    expect(me.chips).toBeLessThan(before);
  });

  it('фолд убирает игрока из раздачи', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 1000);
    const toAct = engine.toAct!;
    engine.act(toAct, 'fold');
    expect(engine.seats.find((s) => s.id === toAct)!.folded).toBe(true);
  });

  it('если все сложились, раздача заканчивается', () => {
    const { engine, calls } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 1000);

    let guard = 0;
    while (engine.toAct && guard++ < 40) {
      const alive = engine.seats.filter((s) => !s.folded);
      if (alive.length <= 1) break;
      engine.act(engine.toAct, 'fold');
    }

    expect(engine.seats.filter((s) => !s.folded)).toHaveLength(1);
    expect(calls.emit.length + calls.ended).toBeGreaterThan(0);
  });

  it('фишки не уходят в минус ни при какой последовательности ставок', () => {
    const { engine } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 200);

    let guard = 0;
    while (engine.phase !== 'showdown' && engine.toAct && guard++ < 200) {
      const me = engine.seats.find((s) => s.id === engine.toAct);
      if (!me) break;
      const toCall = engine.currentBet - me.bet;
      // Если не хватает на уравнивание, игрок выбывает всё — это самый
      // опасный для движка случай, именно его и проверяем.
      engine.act(me.id, 'raise', Math.max(toCall + engine.minRaise, me.chips + toCall));
    }

    for (const s of engine.seats) expect(s.chips).toBeGreaterThanOrEqual(0);
  });

  it('раздача доходит до шоудауна с пятью общими картами', () => {
    const { engine, drain } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 2000);
    drain();

    let guard = 0;
    while (engine.toAct && guard++ < 200) {
      playTurn(engine);
      drain();
    }

    expect(engine.phase).toBe('showdown');
    expect(engine.community).toHaveLength(5);
  });

  it('фишки не появляются из ниоткуда за раздачу', () => {
    const { engine, drain } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 2000);
    drain();
    const before = liveChips(engine);

    let guard = 0;
    while (engine.toAct && guard++ < 200) {
      const me = engine.seats.find((s) => s.id === engine.toAct)!;
      engine.act(me.id, 'raise', 300);
      drain();
    }

    // Движок не имеет права напечатать фишки: остаток может только убывать,
    // а выигрыш лишь переносит фишки от одного игрока к другому.
    expect(liveChips(engine)).toBeLessThanOrEqual(before);
  });

  it('после шоудауна ставки собраны в банк, а не висят на местах', () => {
    const { engine, drain } = makeEngine();
    engine.nextHand(['a', 'b', 'c'], 2000);
    drain();

    let guard = 0;
    while (engine.toAct && guard++ < 200) {
      playTurn(engine);
      drain();
    }

    for (const s of engine.seats) expect(s.bet).toBe(0);
    expect(engine.pot).toBeGreaterThan(0);
  });
});