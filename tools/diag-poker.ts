import { PokerEngine } from '../src/lib/poker';

const queue: (() => void)[] = [];
const engine = new PokerEngine({
  emit: (k) => console.log('   emit:', k),
  update: () => {},
  schedule: (fn) => {
    queue.push(fn);
    return 0;
  },
  handEnded: () => console.log('   handEnded'),
});

const drain = () => {
  let n = 0;
  while (queue.length && n++ < 50) {
    for (const fn of queue.splice(0, queue.length)) fn();
  }
};

engine.nextHand(['a', 'b', 'c'], 2000);
drain();

const show = (tag: string) => {
  console.log(
    `${tag}: phase=${engine.phase} toAct=${engine.toAct} pot=${engine.pot} ` +
      `community=${engine.community.length} bets=[${engine.seats.map((s) => s.bet).join(',')}] ` +
      `chips=[${engine.seats.map((s) => s.chips).join(',')}]`,
  );
};

show('после раздачи');
for (let i = 0; i < 30; i++) {
  if (!engine.toAct) {
    console.log(`   -- ход закончился на шаге ${i}, фаза ${engine.phase}`);
    break;
  }
  const me = engine.seats.find((s) => s.id === engine.toAct)!;
  const toCall = engine.currentBet - me.bet;
  // Чек недопустим, если есть ставка, которую надо уравнять — движок
  // отвергает такой ход, и состояние не меняется. Поэтому ход выбираем по ситуации.
  if (toCall > me.chips) engine.act(me.id, 'raise', me.chips + toCall);
  else engine.act(me.id, toCall > 0 ? 'call' : 'check');
  drain();
  show(`шаг ${i}`);
}

console.log('\nФИНАЛ');
console.log('  community =', engine.community.length, 'фаза =', engine.phase);
console.log('  chips     =', engine.seats.map((s) => s.chips).join(', '));
console.log('  bets      =', engine.seats.map((s) => s.bet).join(', '));
console.log('  pot       =', engine.pot);
console.log(
  '  СУММА (chips+bets+pot) =',
  engine.seats.reduce((n, s) => n + s.chips, 0) +
    engine.seats.reduce((n, s) => n + s.bet, 0) +
    engine.pot,
);