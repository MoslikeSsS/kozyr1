export type Suit = 0 | 1 | 2 | 3; // 0♠ 1♥ 2♦ 3♣
export type Card = { r: number; s: Suit }; // r: 2..14 (11 В, 12 Д, 13 К, 14 Т)

export type GameKind = 'poker' | 'durak';
export type DurakMode = 'classic' | 'transfer';

export type SeatMeta = {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
};

export type LobbyInfo = {
  code: string;
  game: GameKind;
  mode: DurakMode;
  sb: number;
  bb: number;
  maxSeats: number;
  started: boolean;
  seats: SeatMeta[];
};

export type SeatView = {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
  isYou: boolean;
  cardCount: number;
  chips?: number;
  bet?: number;
  folded?: boolean;
  allIn?: boolean;
  dealer?: boolean;
  attacker?: boolean;
  defender?: boolean;
  out?: boolean;
  revealed?: Card[];
};

export type PokerWinner = { seatId: string; amount: number; handName: string; cards: Card[] };

export type PokerView = {
  game: 'poker';
  phase: 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  seats: SeatView[];
  community: Card[];
  pot: number;
  currentBet: number;
  toAct: string | null;
  sb: number;
  bb: number;
  dealerSeat: string | null;
  you: {
    seatId: string;
    hole: Card[];
    canAct: boolean;
    myBet: number;
    chips: number;
    callAmount: number;
    minRaiseTo: number;
    maxRaiseTo: number;
  };
  winners: PokerWinner[] | null;
  matchWinner: string | null;
  handNum: number;
  log: string[];
};

export type DurakPair = { a: Card; d: Card | null };

export type DurakView = {
  game: 'durak';
  phase: 'lobby' | 'attack' | 'done';
  mode: DurakMode;
  seats: SeatView[];
  table: DurakPair[];
  trump: Card | null;
  trumpSuit: Suit | null;
  deckCount: number;
  discardCount: number;
  toAct: string | null;
  taking: boolean;
  you: { seatId: string; hand: Card[]; role: 'attack' | 'defend' | null };
  loser: string | null;
  draw: boolean;
  boutNum: number;
  log: string[];
};

export type View = PokerView | DurakView;

export type Msg =
  | { t: 'hello'; name: string }
  | { t: 'welcome'; seatId: string; lobby: LobbyInfo }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'state'; view: View }
  | { t: 'ev'; kind: string }
  | { t: 'chat'; from: string; text: string }
  | { t: 'action'; a: string; c?: Card; v?: number }
  | { t: 'kicked' }
  | { t: 'err'; msg: string };

export type AdminCmd =
  | { cmd: 'kick'; seatId: string }
  | { cmd: 'addBot' }
  | { cmd: 'start' }
  | { cmd: 'endHand' }
  | { cmd: 'endGame' }
  | { cmd: 'setMode'; v: DurakMode }
  | { cmd: 'setBlinds'; sb: number; bb: number }
  | { cmd: 'topUp' };

export type ChatLine = { id: number; from: string; text: string; mine: boolean };
