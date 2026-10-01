import type { Card, Suit } from './types';

export const SUIT_NAMES = ['Пики', 'Червы', 'Бубны', 'Трефы'] as const;
export const RANK_LABEL: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'В', 12: 'Д', 13: 'К', 14: 'Т',
};
export const RANK_GEN: Record<number, string> = {
  2: 'двойка', 3: 'тройка', 4: 'четвёрка', 5: 'пятёрка', 6: 'шестёрка',
  7: 'семёрка', 8: 'восьмёрка', 9: 'девятка', 10: 'десятка', 11: 'валет',
  12: 'дама', 13: 'король', 14: 'туз',
};
export const RANK_GEN_PL: Record<number, string> = {
  2: 'двоек', 3: 'троек', 4: 'четвёрок', 5: 'пятёрок', 6: 'шестёрок',
  7: 'семёрок', 8: 'восьмёрок', 9: 'девяток', 10: 'десяток', 11: 'валетов',
  12: 'дам', 13: 'королей', 14: 'тузов',
};

export function isRed(s: Suit): boolean {
  return s === 1 || s === 2;
}

export function cardLabel(c: Card): string {
  return RANK_LABEL[c.r] + ' ' + SUIT_NAMES[c.s];
}

export function cardKey(c: Card): string {
  return c.r + '-' + c.s;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.r === b.r && a.s === b.s;
}

export function makeDeck(fromRank: number): Card[] {
  const cards: Card[] = [];
  for (let s = 0 as Suit; s < 4; s = (s + 1) as Suit) {
    for (let r = fromRank; r <= 14; r++) cards.push({ r, s: s as Suit });
  }
  return cards;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardPower(c: Card, trump: Suit | null): number {
  return c.r + (trump !== null && c.s === trump ? 100 : 0);
}

/** Может ли карта d побить карту a при козыре trump */
export function canBeat(a: Card, d: Card, trump: Suit): boolean {
  if (d.s === a.s) return d.r > a.r;
  if (d.s === trump && a.s !== trump) return true;
  return false;
}

export function sortHand(hand: Card[], trump: Suit | null = null): Card[] {
  return hand.slice().sort((x, y) => {
    const tx = trump !== null && x.s === trump ? 1 : 0;
    const ty = trump !== null && y.s === trump ? 1 : 0;
    if (tx !== ty) return tx - ty;
    if (x.s !== y.s) return x.s - y.s;
    return x.r - y.r;
  });
}

export function lowestCard(hand: Card[], trump: Suit | null): Card {
  let best = hand[0];
  for (const c of hand) if (cardPower(c, trump) < cardPower(best, trump)) best = c;
  return best;
}
