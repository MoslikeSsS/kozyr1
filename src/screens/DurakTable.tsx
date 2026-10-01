/* Стол дурака «КОЗЫРЬ».
 *
 * Экран собран только из готовых кирпичиков проекта: карты — CardView,
 * значки — Icons, оформление — классы из index.css (.seat, .seat-turn,
 * .chip, .log-line, .card-face, .playable, .fade-up, .tnum).
 *
 * Контракт наружу не меняется: именованный экспорт DurakTable(view, onAction).
 *
 * Заметки, которые важны при правке:
 *  • Звук играется ТОЛЬКО из эффекта и только по смене состояния: один звук
 *    на одно изменение view, не больше. Тело рендера звук не трогает.
 *  • Анимации — только transform/opacity (framer-motion), ширину/высоту
 *    не анимируем. prefers-reduced-motion учитывается через useReducedMotion.
 *  • Названия действий — как их принимает движок durak.ts:
 *    attack | beat | take | transfer | bito | doneTaking.
 *    (В ТЗ защита названа 'defend'; движок такой команды не знает,
 *    поэтому отправляем 'beat' — см. ACT ниже.)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Card, DurakPair, DurakView, SeatView, Suit } from '../lib/types';
import { SUIT_NAMES, canBeat, cardKey, cardLabel, cardPower, isRed, sortHand } from '../lib/cards';
import { durakHints } from '../lib/durak';
import { CardBack, CardFace, type CardSize } from '../components/CardView';
import { IconBot, IconBolt, IconCards, IconCrown, IconFlag, IconTimer, IconUsers, SuitIcon } from '../components/Icons';
import { play } from '../lib/sound';

export type DurakTableProps = {
  view: DurakView;
  onAction: (a: string, c?: Card) => void;
};

/* Команды, которые понимает DurakEngine.act() */
const ACT = {
  attack: 'attack',
  /** отбиться своей картой (в ТЗ это называлось 'defend') */
  beat: 'beat',
  take: 'take',
  transfer: 'transfer',
  bito: 'bito',
} as const;

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-400/60';
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Габариты карт — те же, что задаёт CardView (у 'md' в нём битая ширина w-13, задаём свою) */
const CARD_PX: Record<CardSize, { w: number; h: number }> = {
  xs: { w: 32, h: 46 },
  sm: { w: 40, h: 58 },
  md: { w: 52, h: 76 },
  lg: { w: 64, h: 92 },
  xl: { w: 80, h: 116 },
};

const TABLE_SIZE: CardSize = 'md';

/**
 * Ширины карт — литеральными строками, иначе Tailwind их не увидит.
 * Они же чинят 'md': в CardView там стоит несуществующий класс w-13.
 */
const W_CLS: Record<CardSize, string> = {
  xs: 'w-8',
  sm: 'w-10',
  md: 'w-[52px]',
  lg: 'w-16',
  xl: 'w-20',
};

/* ------------------------------------------------------------------ */
/* мелкие помощники                                                    */
/* ------------------------------------------------------------------ */

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/**
 * Классы лица карты. В CardView стоят служебные имена цветов, которых нет
 * в tailwind.config, поэтому бумагу и цвет знаков задаём здесь готовыми
 * классами .card-face из index.css и настоящими цветами палитры.
 */
function faceCls(c: Card, extra = ''): string {
  return ['card-face', isRed(c.s) ? 'text-cardred' : 'text-cardblack', extra].filter(Boolean).join(' ');
}

/** Геометрия веера под текущую ширину контейнера и число карт */
function fanGeometry(width: number, n: number) {
  const size: CardSize = width < 380 ? 'sm' : width < 620 ? 'md' : 'lg';
  const { w, h } = CARD_PX[size];
  const avail = Math.max(w, width - 12);
  const step = n > 1 ? Math.min(w * 0.74, Math.max(w * 0.28, (avail - w) / (n - 1))) : 0;
  const depth = 14;
  return { size, w, h, step, depth, boxH: h + depth + 18 };
}

function Badge({ tone, text }: { tone: 'gold' | 'plain' | 'warn' | 'muted'; text: string }) {
  const tones = {
    gold: 'border-gold-400/50 bg-gold-400/10 text-gold-300',
    plain: 'border-[color:var(--line)] bg-black/30 text-[color:var(--text)]',
    warn: 'border-rose-400/50 bg-rose-500/15 text-rose-200',
    muted: 'border-[color:var(--line)] bg-black/20 text-[color:var(--muted)]',
  };
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[14px] font-medium leading-tight ${tones[tone]}`}>
      {text}
    </span>
  );
}

/** Стопка карт рубашкой с числом — колода или отбой */
function PileBox({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[58px] w-10">
        {count > 0 ? (
          <>
            {count > 2 && <CardBack size="sm" className="absolute inset-x-0 top-2 rotate-[6deg]" />}
            {count > 1 && <CardBack size="sm" className="absolute inset-x-0 top-1 rotate-[-5deg]" />}
            <CardBack size="sm" className="absolute inset-x-0 top-0" />
          </>
        ) : (
          <div className="absolute inset-0 rounded-md border-2 border-dashed border-[color:var(--line)]" />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="tnum rounded-md bg-black/70 px-1.5 py-0.5 text-[14px] font-bold leading-none text-gold-300">
            {count}
          </span>
        </span>
      </div>
      <span className="text-[14px] text-[color:var(--muted)]">{label}</span>
    </div>
  );
}

/** Место за столом: рубашка со счётом, имя, метки роли */
function SeatPill({ seat, isTurn, taking }: { seat: SeatView; isTurn: boolean; taking: boolean }) {
  return (
    <div
      className={[
        'seat rounded-xl px-2 py-1.5',
        seat.isYou ? 'bg-gold-400/[.10] shadow-glowgold' : 'bg-black/25',
        seat.out ? 'opacity-55' : '',
        isTurn ? 'seat-turn' : '',
      ].join(' ')}
    >
      <div className="relative">
        <CardBack size="xs" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="tnum rounded bg-black/70 px-1 text-[14px] font-bold leading-tight text-gold-300">
            {seat.cardCount}
          </span>
        </span>
      </div>

      <div className="flex max-w-[112px] items-center justify-center gap-1">
        {seat.bot && <IconBot className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />}
        <span className="truncate text-[14px] font-semibold leading-tight text-[color:var(--text)]">
          {seat.name}
        </span>
      </div>
      {seat.isYou && <span className="text-[14px] font-medium leading-none text-gold-300">это вы</span>}

      <div className="flex flex-wrap items-center justify-center gap-1">
        {seat.out && <Badge tone="muted" text="вышел" />}
        {!seat.out && seat.attacker && <Badge tone="gold" text="атакует" />}
        {!seat.out && seat.defender && <Badge tone="plain" text="отбивается" />}
        {taking && !seat.out && seat.defender && <Badge tone="warn" text="берёт" />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* экран                                                               */
/* ------------------------------------------------------------------ */

export function DurakTable(props: { view: DurakView; onAction: (a: string, c?: Card) => void }): JSX.Element {
  const { view, onAction } = props;
  const reduce = useReducedMotion();

  /* ---- звук: одно изменение view — максимум один звук ---- */
  const prevRef = useRef<DurakView>(view);
  useEffect(() => {
    const p = prevRef.current;
    if (p === view) return;
    const defended = (x: DurakView) => x.table.reduce((t, pair) => t + (pair.d ? 1 : 0), 0);

    if (view.taking && !p.taking) play('take');
    else if (view.table.length > p.table.length) play('attack');
    else if (defended(view) > defended(p)) play('bito');
    else if (view.loser !== null && p.loser === null) play(view.draw ? 'win' : 'lose');
    else if (view.draw && !p.draw) play('win');
    else if (p.trump === null && view.trump !== null) play('deal');

    prevRef.current = view;
  }, [view]);

  /* ---- ширина контейнера веера: по ней считаем размер и шаг карт ---- */
  const fanRef = useRef<HTMLDivElement | null>(null);
  const [fanW, setFanW] = useState(0);
  useEffect(() => {
    const el = fanRef.current;
    if (!el) return;
    const measure = () => setFanW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- производные данные ---- */
  const hand = useMemo(() => sortHand(view.you.hand, view.trumpSuit), [view.you.hand, view.trumpSuit]);
  const hints = useMemo(() => durakHints(view), [view]);
  const geom = fanGeometry(fanW || 340, hand.length);

  /* Подсказки движка приходят индексами его же руки — держим их по карте,
     чтобы порядок сортировки на веере ничего не путал. */
  const hintBeatKeys = useMemo(
    () => new Set(hints.beat.map((i) => cardKey(view.you.hand[i]))),
    [hints.beat, view.you.hand],
  );
  const hintPlayKeys = useMemo(
    () => new Set(hints.play.map((i) => cardKey(view.you.hand[i]))),
    [hints.play, view.you.hand],
  );
  const hintTransferKeys = useMemo(
    () => new Set(hints.transfer.map((i) => cardKey(view.you.hand[i]))),
    [hints.transfer, view.you.hand],
  );

  const trumpSuit: Suit | null = view.trumpSuit;
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of view.seats) m[s.id] = s.name;
    return m;
  }, [view.seats]);

  const nameOf = (id: string | null): string => (id && names[id] ? names[id] : '—');
  const isMine = view.phase === 'attack' && view.toAct !== null && view.toAct === view.you.seatId;
  const interactive = isMine && view.you.role !== null;

  const unbeaten = useMemo(() => view.table.filter((pair) => pair.d === null), [view.table]);
  const allBeaten = view.table.length > 0 && unbeaten.length === 0;

  /* карты, которыми реально можно побить текущую атаку */
  const beaters: Card[] = [];
  if (trumpSuit !== null && unbeaten.length > 0) {
    const t = trumpSuit;
    const target: Card = unbeaten[0].a;
    for (const c of hand) if (canBeat(target, c, t)) beaters.push(c);
  }
  const cheapest: Card | null = beaters.length
    ? beaters.reduce((a, b) => (cardPower(a, trumpSuit) <= cardPower(b, trumpSuit) ? a : b))
    : null;

  const defenderSeat = view.seats.find((s) => s.defender);
  const takerSeat = view.taking ? defenderSeat : undefined;
  const loserSeat = view.loser ? view.seats.find((s) => s.id === view.loser) : undefined;
  const loserName = view.loser ? nameOf(view.loser) : '';

  /* ---- заголовок хода ---- */
  let turnTitle: string;
  let turnNote: string;
  if (view.phase === 'lobby') {
    turnTitle = 'Стол ждёт начала';
    turnNote = 'Партию запускает хост — после старта раздадут карты и назначат козыря.';
  } else if (view.phase === 'done') {
    turnTitle = view.draw ? 'Ничья' : `Проигрывает ${loserName}`;
    turnNote = view.draw
      ? 'Все вышли из игры одновременно.'
      : `Дурак — ${loserName}. Новая партия начнётся совсем скоро.`;
  } else if (view.you.role === 'attack' && isMine) {
    turnTitle = 'Ваш ход — атакуйте';
    turnNote = allBeaten
      ? 'Подкиньте карту того же достоинства или скажите «Бито».'
      : 'Карта на столе ещё не отбита — дождитесь защиты.';
  } else if (view.you.role === 'defend' && isMine) {
    turnTitle = 'Ваш ход — защищайтесь';
    turnNote = cheapest
      ? `Отбейте карту: подойдёт ${cardLabel(cheapest)}.`
      : 'Бить нечем — можно взять карты со стола.';
  } else {
    turnTitle = 'Ждём остальных';
    turnNote = `Ходит ${nameOf(view.toAct)}.`;
  }

  /* ---- панель действий: видна всегда, но может быть неактивной ---- */
  const canTake = interactive && view.you.role === 'defend' && !view.taking && unbeaten.length > 0;
  const canBito = interactive && view.you.role === 'attack' && !view.taking && view.table.length > 0 && allBeaten;
  const actions: { label: string; act: string; icon: 'take' | 'bito' }[] = [];
  if (canTake) actions.push({ label: 'Взять', act: ACT.take, icon: 'take' });
  if (canBito) actions.push({ label: 'Бито', act: ACT.bito, icon: 'bito' });
  const actionsNote =
    view.phase !== 'attack'
      ? 'Действий нет — партия не идёт.'
      : view.you.role === null
        ? 'Действий нет: вы не ходите в этом взятке.'
        : 'Действий нет: сейчас не ваш ход.';

  /* ---- ход картой с руки ---- */
  const playCard = (c: Card) => {
    if (!interactive) return;
    const k = cardKey(c);
    if (view.you.role === 'attack') onAction(ACT.attack, c);
    else if (hintTransferKeys.has(k) && !hintBeatKeys.has(k)) onAction(ACT.transfer, c);
    else onAction(ACT.beat, c);
  };

  /* ---- лог: подставляем имена вместо идентификаторов мест ---- */
  const logLines = useMemo(() => {
    const ids = Object.keys(names);
    return view.log.slice(-7).map((line) => {
      let out = line;
      for (const id of ids) {
        if (!id || id === names[id] || out.indexOf(id) < 0) continue;
        out = out.split(id).join(names[id]);
      }
      return out;
    });
  }, [view.log, names]);

  const modeText = view.mode === 'transfer' ? 'Отбиваешься своей картой, она уходит в атаку' : 'Подкидывать можно любую карту';
  const center = (hand.length - 1) / 2;

  return (
    <div className="flex w-full flex-col gap-3 pb-6 lg:gap-4">
      {/* ---------------- верх: козырь, колода, отбой, режим ---------------- */}
      <header className="flex flex-wrap items-stretch gap-3 lg:gap-4">
        <div className="panel flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[14px] font-semibold uppercase tracking-[.18em] text-gold-300">козырь</span>
            {view.trump ? (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.86, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
              >
                <CardFace c={view.trump} size="lg" className={faceCls(view.trump, 'ring-2 ring-gold-400/80')} />
              </motion.div>
            ) : (
              <div className="flex h-[92px] w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gold-400/40 px-1.5 text-center">
                <IconCards className="h-5 w-5 text-gold-300/70" />
                <span className="text-[14px] leading-tight text-[color:var(--muted)]">определится позже</span>
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-[220px]">
            {view.trump ? (
              <>
                <p className="flex items-center gap-2 font-display text-[17px] font-semibold leading-tight text-[color:var(--text)] sm:text-lg">
                  <SuitIcon s={view.trump.s} className="h-5 w-5 shrink-0 text-gold-300" />
                  {cardLabel(view.trump)}
                </p>
                <p className="mt-1 text-[14px] leading-snug text-[color:var(--muted)]">
                  Масть «{SUIT_NAMES[view.trump.s]}» бьёт все остальные
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[17px] font-semibold leading-tight text-[color:var(--text)] sm:text-lg">
                  Козырь не назначен
                </p>
                <p className="mt-1 text-[14px] leading-snug text-[color:var(--muted)]">
                  Козырь определится после первой карты
                </p>
              </>
            )}
          </div>
        </div>

        <div className="panel flex flex-1 items-center gap-4 p-3 sm:gap-6 sm:p-4">
          <PileBox label="Колода" count={view.deckCount} />
          <PileBox label="Отбой" count={view.discardCount} />
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span className="chip tnum text-[14px]">взятка {view.boutNum}</span>
            <p className="max-w-[240px] text-[14px] leading-snug text-[color:var(--muted)]">{modeText}</p>
          </div>
        </div>
      </header>

      {/* ---------------- итог партии ---------------- */}
      {view.phase === 'done' && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
          className="panel fade-up flex items-center gap-3 border-gold-400/60 bg-gold-400/10 p-4"
          role="status"
        >
          <IconCrown className="h-9 w-9 shrink-0 text-gold-300" />
          <div className="min-w-0">
            <p className="font-display text-xl font-bold leading-tight text-[color:var(--text)]">
              {view.draw
                ? 'Ничья'
                : `Проигрывает ${loserName}, ${loserSeat ? loserSeat.cardCount : 0} ${plural(
                    loserSeat ? loserSeat.cardCount : 0,
                    'карта',
                    'карты',
                    'карт',
                  )}`}
            </p>
            <p className="mt-1 text-[15px] text-[color:var(--muted)]">
              {view.draw
                ? 'Все вышли из игры одновременно — никто не проиграл.'
                : 'Взятка закрыта. Новая партия начнётся совсем скоро.'}
            </p>
          </div>
        </motion.div>
      )}

      {/* ---------------- места за столом ---------------- */}
      <section aria-label="Игроки за столом" className="flex flex-wrap items-start justify-center gap-2 sm:gap-3">
        {view.seats.length === 0 ? (
          <p className="text-[15px] text-[color:var(--muted)]">Игроки ещё не заняли места.</p>
        ) : (
          view.seats.map((s) => (
            <SeatPill key={s.id} seat={s} isTurn={view.toAct === s.id} taking={view.taking} />
          ))
        )}
      </section>

      {/* ---------------- карты на столе ---------------- */}
      <section
        aria-label="Карты на столе"
        className="panel-inset flex min-h-[136px] flex-col items-center justify-center gap-3 p-3 sm:p-4"
      >
        {view.table.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <IconCards className="h-8 w-8 text-gold-300/70" />
            <p className="text-[15px] text-[color:var(--muted)]">
              {view.phase === 'lobby' ? 'Стол ждёт начала партии' : 'Стол пока пуст — первая карта ляжет здесь'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
              {view.table.map((pair, i) => (
                <TablePair key={pairKey(pair)} pair={pair} index={i} reduce={!!reduce} />
              ))}
            </div>
            {unbeaten.length > 0 && (
              <p className="flex items-center gap-2 text-[14px] text-[color:var(--muted)]">
                <IconTimer className="h-4 w-4 text-gold-300/80" />
                ждём защиту — {unbeaten.length} {plural(unbeaten.length, 'карта', 'карты', 'карт')}
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------- взятие ---------------- */}
      {view.taking && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
          className="panel fade-up flex items-center gap-3 border-rose-400/45 bg-rose-500/10 p-3.5"
          role="status"
        >
          <IconBolt className="h-7 w-7 shrink-0 text-rose-200" />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-tight text-[color:var(--text)]">
              {takerSeat ? `${takerSeat.name} берёт карты` : 'Защитник берёт карты'}
            </p>
            <p className="text-[14px] leading-snug text-[color:var(--muted)]">
              {view.you.role === 'attack'
                ? 'Подкиньте карту перед тем, как он заберёт стол.'
                : 'Карты со стола уйдут к защитнику.'}
            </p>
          </div>
        </motion.div>
      )}

      {/* ---------------- чей ход + действия ---------------- */}
      <section
        aria-label="Подсказка хода"
        className={[
          'panel flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          isMine ? 'border-gold-400/60 bg-gold-400/[.08]' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <IconCrown className="h-7 w-7 shrink-0 text-gold-300" />
          <div className="min-w-0">
            <p className="font-display text-[17px] font-semibold leading-tight text-[color:var(--text)] sm:text-lg">
              {turnTitle}
            </p>
            <p className="mt-0.5 text-[14px] leading-snug text-[color:var(--muted)]">{turnNote}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions.length === 0 ? (
            <span className="text-[14px] text-[color:var(--muted)]">{actionsNote}</span>
          ) : (
            actions.map((a) => (
              <motion.button
                key={a.act}
                type="button"
                whileTap={reduce ? undefined : { scale: 0.96 }}
                onClick={() => onAction(a.act)}
                className={`btn-ghost min-h-[44px] cursor-pointer !text-[15px] ${FOCUS}`}
              >
                {a.icon === 'take' ? <IconCards className="h-5 w-5" /> : <IconFlag />}
                {a.label}
              </motion.button>
            ))
          )}
        </div>
      </section>

      {/* ---------------- ваши карты веером ---------------- */}
      <section aria-label="Ваши карты" className="panel flex flex-col items-center gap-2 p-3 sm:p-4">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[14px] font-semibold uppercase tracking-[.18em] text-gold-300">ваши карты</span>
          <span className="tnum text-[14px] text-[color:var(--muted)]">
            {hand.length} {plural(hand.length, 'карта', 'карты', 'карт')}
          </span>
        </div>

        <div ref={fanRef} className="relative w-full" style={{ height: geom.boxH }}>
          {hand.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <IconCards className="h-7 w-7 text-gold-300/70" />
                <p className="max-w-[280px] text-[15px] leading-snug text-[color:var(--muted)]">
                  {view.you.role ? 'Карт нет — вы вышли из игры' : 'В этой раздаче у вас нет карт'}
                </p>
              </div>
            </div>
          ) : (
            hand.map((c, i) => {
              const k = cardKey(c);
              const playable =
                interactive &&
                (view.you.role === 'attack' ? hintPlayKeys.has(k) : hintBeatKeys.has(k) || hintTransferKeys.has(k));
              const t = hand.length > 1 ? (i - center) / center : 0;
              const x = (i - center) * geom.step;
              const rotate = t * 16;
              const y = t * t * geom.depth;

              return (
                <motion.button
                  key={k}
                  type="button"
                  disabled={!interactive}
                  onClick={() => playCard(c)}
                  aria-label={`${cardLabel(c)}${playable ? ' — можно сыграть' : ' — нельзя сыграть сейчас'}`}
                  className={[
                    'absolute rounded-lg',
                    interactive ? 'cursor-pointer hover:z-20' : 'cursor-default',
                    playable ? 'playable z-10' : '',
                    FOCUS,
                  ].join(' ')}
                  style={{ left: '50%', marginLeft: -geom.w / 2, width: geom.w }}
                  initial={false}
                  animate={{ x, y, rotate }}
                  whileHover={interactive && !reduce ? { y: y - 16 } : undefined}
                  whileTap={interactive && !reduce ? { scale: 0.96 } : undefined}
                  transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
                >
                  <motion.span
                    className="block"
                    initial={reduce ? false : { opacity: 0, y: -18, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: reduce ? 0 : 0.34,
                      ease: EASE,
                      delay: reduce ? 0 : Math.min(i, 12) * 0.05,
                    }}
                  >
                    <CardFace c={c} size={geom.size} className={faceCls(c, W_CLS[geom.size])} />
                  </motion.span>
                </motion.button>
              );
            })
          )}
        </div>
      </section>

      {/* ---------------- лог ---------------- */}
      <section aria-label="Ход партии" className="panel px-3.5 py-3 sm:px-4">
        <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[.18em] text-gold-300">
          <IconUsers className="h-4 w-4" />
          ход партии
        </div>
        <div className="max-h-[132px] overflow-y-auto border-l-2 border-[color:var(--line)] pl-3">
          {logLines.length === 0 ? (
            <p className="log-line text-[14px]">Пока тихо — событий ещё не было.</p>
          ) : (
            logLines.map((line, i) => (
              <p key={`${i}-${line}`} className="log-line text-[14px]">
                {line}
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/** Пара «атака — защита» на столе */
function TablePair({ pair, index, reduce }: { pair: DurakPair; index: number; reduce: boolean }) {
  const { w, h } = CARD_PX[TABLE_SIZE];
  const delay = reduce ? 0 : Math.min(index, 10) * 0.05;
  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -16, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.36, ease: EASE, delay }}
      >
        <CardFace c={pair.a} size={TABLE_SIZE} className={faceCls(pair.a, W_CLS[TABLE_SIZE])} />
      </motion.div>

      {pair.d ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 0.92, x: 10 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: EASE, delay: delay + 0.05 }}
        >
          <CardFace c={pair.d} size={TABLE_SIZE} className={faceCls(pair.d, W_CLS[TABLE_SIZE])} />
        </motion.div>
      ) : (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: EASE, delay: delay + 0.05 }}
          style={{ height: h, width: w }}
          className="flex shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gold-400/40"
        >
          <IconTimer className="h-5 w-5 text-gold-300/80" />
        </motion.div>
      )}
    </div>
  );
}

function pairKey(p: DurakPair): string {
  return cardKey(p.a) + '|' + (p.d ? cardKey(p.d) : '-');
}

export default DurakTable;