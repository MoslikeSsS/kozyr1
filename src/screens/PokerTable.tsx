import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Card, PokerView, SeatView } from '../lib/types';
import { CardBack, CardFace } from '../components/CardView';
import { IconBot, IconBolt, IconCards, IconCrown, IconFlag, IconRefresh, IconTimer, IconUsers } from '../components/Icons';
import { cardLabel } from '../lib/cards';
import { play } from '../lib/sound';

/* ============================================================================
   Стол покера «КОЗЫРЬ».

   Контракт зафиксирован оболочкой комнаты:
     <PokerTable view={pokerView} onAction={(a, v) => session.action(a, undefined, v)} />

   Раскладка мест: игроки стоят по эллипсу вокруг стола, «вы» — всегда внизу
   (индекс 0), остальные идут против часовой стрелки от вас, как в живой игре.
   Координаты в процентах от размеров стола, поэтому одинаково работают и на
   телефоне, и на десктопе, и не требуют горизонтального скролла.

   Звук: только из useEffect по изменению состояния и только через useRef со
   значением «как было» — тогда событие проигрывается ровно один раз, а не на
   каждой перерисовке.
   ============================================================================ */

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-400/50';
/**
 * hover только там, где есть настоящий курсор: на тач-устройствах
 * :hover «залипает» после тапа и подсвечивает не то.
 * Кнопки .btn-* уже имеют hover в index.css, поэтому здесь — свои элементы.
 */
const HOVER = '[@media(hover:hover)]:hover:';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const PHASE_LABEL: Record<PokerView['phase'], string> = {
  lobby: 'ожидание',
  preflop: 'блайнды',
  flop: 'флоп',
  turn: 'терн',
  river: 'ривер',
  showdown: 'шоудаун',
};

/** Позиция места i из n на эллипсе стола. i = 0 — игрок внизу (это «вы»). */
function seatSpot(i: number, n: number): { x: number; y: number } {
  const rad = ((90 + (i * 360) / n) * Math.PI) / 180;
  return { x: 50 + 41 * Math.cos(rad), y: 50 + 40 * Math.sin(rad) };
}

/** Точка между местом и центром стола — туда кладём фишку ставки. */
function betSpot(x: number, y: number): { x: number; y: number } {
  const dx = 50 - x;
  const dy = 50 - y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: x + (dx / len) * 11, y: y + (dy / len) * 14 };
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(Math.max(v, lo), hi);
}

/* ---------------------------------------------------------------- карточки */

/**
 * Общая карта: приходит с анимацией из центра стола.
 * Карта — ссылка на картинку для скринридера, оборачиваем: CardFace своё
 * aria-label не принимает, а текстовая альтернатива карте нужна обязательно.
 */
function CommunityCard({ card, index, fresh }: { card: Card; index: number; fresh: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="block"
      initial={fresh && !reduce ? { opacity: 0, y: -34, scale: 0.84, rotate: -7 } : false}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ duration: reduce ? 0 : 0.42, delay: reduce ? 0 : index * 0.05, ease: EASE }}
    >
      <span role="img" aria-label={cardLabel(card)} className="block">
        <CardFace c={card} size="sm" />
      </span>
    </motion.span>
  );
}

/* ------------------------------------------------------------------- место */

type SeatProps = {
  seat: SeatView;
  isTurn: boolean;
  isWinner: boolean;
  winName: string;
};

function SeatPlate({ seat, isTurn, isWinner, winName }: SeatProps) {
  const dim = !!seat.folded;
  const name = seat.name.trim() || 'Игрок';

  return (
    <div
      className={[
        'seat w-[74px] rounded-xl border px-1.5 py-1.5 transition-[box-shadow,background-color] sm:w-[104px] sm:px-2',
        HOVER + 'shadow-[0_6px_22px_-10px_rgba(0,0,0,.9)]',
        isTurn ? 'seat-turn border-gold-400/70 bg-black/60' : 'border-[color:var(--line)] bg-black/45',
        dim ? 'opacity-40 grayscale' : '',
        isWinner ? 'win-pulse border-gold-300 bg-gold-400/15' : '',
      ].join(' ')}
    >
      {/* Метка дилера */}
      {seat.dealer && (
        <span
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border
                     border-gold-300/70 bg-felt-700 font-display text-sm font-bold leading-none text-gold-300"
          title="Дилер"
        >
          D
        </span>
      )}

      <div className="flex w-full items-center justify-center gap-1">
        {seat.isHost && <IconCrown className="h-3.5 w-3.5 shrink-0 text-gold-300" />}
        {seat.bot && <IconBot className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" />}
        <span className="truncate text-sm font-semibold leading-tight text-[color:var(--text)]">
          {seat.isYou ? 'Вы' : name}
        </span>
      </div>

      <div className="flex w-full items-center justify-center gap-1">
        <span
          className={[
            'h-1.5 w-1.5 shrink-0 rounded-full',
            seat.connected ? 'bg-emerald-400' : 'bg-[color:var(--muted)]',
          ].join(' ')}
          aria-hidden
        />
        <span className="stack !px-1.5 !py-0.5 !text-sm" aria-label="Фишек">
          {seat.chips ?? 0}
        </span>
      </div>

      {/* Карты: рубашкой, пока не вскрыты */}
      {seat.revealed && seat.revealed.length > 0 ? (
        <div className="flex -space-x-2" role="group" aria-label="Вскрытые карты">
          {seat.revealed.map((c) => (
            <span key={c.r + '-' + c.s} role="img" aria-label={cardLabel(c)} className="block">
              <CardFace c={c} size="xs" className="!w-7 !h-10" />
            </span>
          ))}
        </div>
      ) : seat.cardCount > 0 ? (
        <div className="flex items-center justify-center gap-1">
          <span className="relative block h-8 w-6">
            <CardBack
              size="xs"
              className="absolute left-0 top-0"
              style={{ transform: 'scale(.46)', transformOrigin: 'top left' }}
            />
            {seat.cardCount > 1 && (
              <CardBack
                size="xs"
                className="absolute left-2 top-0"
                style={{ transform: 'scale(.46) rotate(9deg)', transformOrigin: 'top left' }}
              />
            )}
          </span>
          <span className="tnum text-sm font-semibold text-[color:var(--muted)]">{seat.cardCount}</span>
        </div>
      ) : (
        <span className="h-8 text-sm leading-8 text-[color:var(--muted)]">—</span>
      )}

      {seat.allIn && (
        <span className="chip !border-gold-300/70 !bg-gold-400/20 !px-1.5 !py-0 !text-sm font-bold text-gold-300">
          <IconFlag className="h-3.5 w-3.5" />
          всё в фишки
        </span>
      )}
      {dim && <span className="text-sm font-medium text-[color:var(--muted)]">сбросил</span>}
      {isWinner && <span className="tnum text-sm font-bold text-gold-300">{winName}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------- банк */

function Pot({ amount }: { amount: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      // Смена pot = новый ключ = перезапуск анимации: банк заметно подпрыгивает
      key={'pot-' + amount}
      initial={reduce ? false : { opacity: 0, scale: 0.62, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 460, damping: 15 }}
      className="flex items-center gap-2 rounded-full border border-gold-400/45 bg-black/55 px-3.5 py-1.5
                 shadow-glowgold backdrop-blur-sm sm:px-4"
    >
      <IconBolt className="h-4 w-4 shrink-0 text-gold-300" />
      <span className="tnum font-display text-xl font-bold leading-none text-gold-300 sm:text-2xl">{amount}</span>
    </motion.div>
  );
}

/* ============================================================== компонент */

export function PokerTable({ view, onAction }: { view: PokerView; onAction: (a: string, v?: number) => void }) {
  const reduce = useReducedMotion();
  const { you } = view;

  /* --- состояние панели повышения ------------------------------------- */
  const [raiseTo, setRaiseTo] = useState(you.minRaiseTo);
  const minTo = you.minRaiseTo;
  const maxTo = you.maxRaiseTo;
  const wasActing = useRef(false);

  // Обнуляем ползунок только на входе в свой ход, а не на каждом чихе движка.
  useEffect(() => {
    if (you.canAct && !wasActing.current) setRaiseTo(you.minRaiseTo);
    wasActing.current = you.canAct;
  }, [you.canAct, you.minRaiseTo]);

  // Границы поворота могли сдвинуться (кто-то повысил) — подрезаем значение.
  useEffect(() => {
    setRaiseTo((v) => clamp(Number.isFinite(v) ? v : minTo, minTo, maxTo));
  }, [minTo, maxTo]);

  const raiseVal = clamp(Number.isFinite(raiseTo) ? raiseTo : minTo, minTo, maxTo);
  const raiseExtra = Math.max(0, raiseVal - you.myBet);
  const canRaise = you.canAct && maxTo > you.myBet;
  const forcedAllIn = canRaise && maxTo <= minTo;

  // Пока поле пустое, показываем пустую строку, а не сразу minTo:
  // иначе невозможно стереть значение, чтобы набрать новое.
  const [raiseText, setRaiseText] = useState<string | null>(null);
  const raiseShown = raiseText ?? String(raiseVal);

  const onRaiseInput = (raw: string) => {
    if (raw === '') {
      setRaiseText('');
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setRaiseTo(clamp(Math.round(n), minTo, maxTo));
    setRaiseText(null);
  };

  /* --- звук: каждое событие ровно один раз ----------------------------- */
  const prevPhase = useRef<PokerView['phase'] | null>(null);
  const prevWinKey = useRef('');
  const prevAllIn = useRef(false);
  const prevMatch = useRef<string | null>(null);

  // 1. Смена фазы раздачи — карты пришли на стол.
  useEffect(() => {
    if (prevPhase.current === null) {
      prevPhase.current = view.phase;
      return;
    }
    if (prevPhase.current !== view.phase) {
      prevPhase.current = view.phase;
      if (view.phase !== 'lobby') play('deal');
    }
  }, [view.phase]);

  // 2. Появились победители раздачи.
  useEffect(() => {
    const key = view.winners ? view.winners.map((w) => `${w.seatId}:${w.amount}`).join('|') : '';
    if (key && key !== prevWinKey.current) {
      const top = Math.max(...view.winners!.map((w) => w.amount));
      play(top >= view.bb * 20 ? 'bigwin' : 'win');
    }
    prevWinKey.current = key;
  }, [view.winners, view.bb]);

  // 3. Мы зашли в олл-ин.
  const meAllIn = !!view.seats.find((s) => s.isYou)?.allIn;
  useEffect(() => {
    if (meAllIn && !prevAllIn.current) play('chip');
    prevAllIn.current = meAllIn;
  }, [meAllIn]);

  // 4. Матч окончен.
  useEffect(() => {
    if (view.matchWinner && view.matchWinner !== prevMatch.current) {
      play(view.matchWinner === you.seatId ? 'win' : 'lose');
    }
    prevMatch.current = view.matchWinner;
  }, [view.matchWinner, you.seatId]);

  /* --- производное ---------------------------------------------------- */

  const atTable = useMemo(() => view.seats.filter((s) => !s.out), [view.seats]);
  const outSeats = useMemo(() => view.seats.filter((s) => s.out), [view.seats]);

  // «Вы» всегда нулевой — иначе раскладка прыгает при смене мест.
  const youIdx = atTable.findIndex((s) => s.isYou);
  const ordered = youIdx < 0 ? atTable : [...atTable.slice(youIdx), ...atTable.slice(0, youIdx)];

  const logLines = useMemo(() => view.log.slice(-8), [view.log]);

  const winnerById = useMemo(() => {
    const m = new Map<string, { handName: string; amount: number; cards: Card[] }>();
    for (const w of view.winners ?? []) m.set(w.seatId, w);
    return m;
  }, [view.winners]);

  const matchWinnerSeat = view.matchWinner ? view.seats.find((s) => s.id === view.matchWinner) : undefined;

  const toActSeat = view.toAct ? view.seats.find((s) => s.id === view.toAct) : undefined;
  let statusText: string;
  if (view.phase === 'lobby') statusText = 'Стол ждёт начала раздачи';
  else if (toActSeat) statusText = toActSeat.isYou ? 'Ваш ход' : `Ход: ${toActSeat.name}`;
  else if (view.winners) statusText = 'Раздача завершена';
  else statusText = 'Ждём действия…';

  // Предыдущее число общих карт: по нему решаем, какие карты «только что» пришли.
  const prevCommunity = useRef(view.community.length);
  const [freshFrom, setFreshFrom] = useState(view.community.length);
  useEffect(() => {
    const len = view.community.length;
    if (len > prevCommunity.current) setFreshFrom(prevCommunity.current);
    else if (len < prevCommunity.current) setFreshFrom(len);
    prevCommunity.current = len;
  }, [view.community.length]);

  const act = (a: string, v?: number) => onAction(a, v);

  return (
    <div className="fade-up flex min-h-full w-full flex-col gap-2.5 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
      {/* ==================== шапка стола ==================== */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className="chip !border-gold-400/45 !bg-gold-400/10 !text-sm !text-gold-300"
          aria-live="polite"
        >
          <IconCards className="h-3.5 w-3.5" />
          <span className="uppercase tracking-[.12em]">{PHASE_LABEL[view.phase]}</span>
        </span>
        <span className="tnum text-sm text-[color:var(--muted)]">
          раздача {view.handNum} · блайнды {view.sb}/{view.bb}
        </span>
        <span className="tnum ml-auto inline-flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
          <IconUsers className="h-4 w-4" />
          {atTable.length} за столом
        </span>
      </div>

      {/* ==================== стол ==================== */}
      <div className="relative mx-auto w-full max-w-[1100px] h-[clamp(330px,56vh,540px)]">
        {/* сукно */}
        <div
          className="absolute inset-x-[1%] inset-y-0 rounded-[46%] border border-gold-400/15
                     bg-gradient-to-b from-felt-600 to-felt-800 shadow-panel"
          aria-hidden
        />
        <div
          className="absolute inset-x-[7%] inset-y-[4%] rounded-[46%] border border-[color:var(--line)]"
          aria-hidden
        />

        {/* центр: банк + общие карты. justify-center держит ряд ровно по центру
            при любом количестве карт от 0 до 5. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 sm:gap-3">
          <Pot amount={view.pot} />
          {view.community.length > 0 && (
            <div
              className="flex items-center justify-center gap-1.5 scale-[.86] sm:scale-100 md:scale-[1.15]"
              role="group"
              aria-label="Общие карты"
            >
              {view.community.map((c, i) => (
                <CommunityCard key={c.r + '-' + c.s + '-' + i} card={c} index={i} fresh={i >= freshFrom} />
              ))}
            </div>
          )}
        </div>

        {/* места. Раскладка рассчитана на 2–6 мест (столько максимум в комнате),
            но рисуем все: пустой стол из-за неверного n хуже, чем тесные места. */}
        {ordered.map((seat, i) => {
          const { x, y } = seatSpot(i, ordered.length);
          const b = betSpot(x, y);
          const win = winnerById.get(seat.id);
          return (
            <div key={seat.id}>
              <div
                className="absolute"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <SeatPlate
                  seat={seat}
                  isTurn={view.toAct === seat.id}
                  isWinner={!!win}
                  winName={win ? `+${win.amount}` : ''}
                />
              </div>
              {!!seat.bet && (
                <div
                  className="absolute"
                  style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {/* Внешний div держит центровку, motion — только появление:
                      иначе framer перезапишет transform и фишка съедет с места. */}
                  <motion.div
                    className="flex items-center gap-1 rounded-full border border-gold-400/40
                               bg-black/60 px-2 py-0.5 backdrop-blur-sm"
                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                  >
                    <span className="h-2 w-2 rounded-full bg-gold-400" aria-hidden />
                    <span className="tnum text-sm font-bold text-gold-300">{seat.bet}</span>
                    <span className="sr-only">ставка</span>
                  </motion.div>
                </div>
              )}
            </div>
          );
        })}

        {/* Шоудаун: карта выигрыша поверх стола. В момент раздачи это главная
            информация, поэтому перекрываем сукно, а не теснимся с местами. */}
        <AnimatePresence>
          {view.winners && view.winners.length > 0 && (
            <motion.div
              key={'winners-' + view.winners.length}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-[46%] p-3"
              initial={reduce ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
            >
              <div className="absolute inset-0 rounded-[46%] bg-felt-900/72 backdrop-blur-[2px]" aria-hidden />
              <div
                className="win-pulse relative flex max-w-full flex-col items-center gap-2 rounded-2xl
                           border border-gold-400/45 bg-felt-700/95 px-4 py-3 shadow-panel"
                role="status"
              >
                {view.winners.map((w) => {
                  const s = view.seats.find((x) => x.id === w.seatId);
                  return (
                    <div key={w.seatId} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                      <span className="font-display text-lg font-bold text-gold-300">
                        {s?.isYou ? 'Вы' : s?.name ?? 'Игрок'}
                      </span>
                      <span className="tnum text-base font-bold text-[color:var(--text)]">+{w.amount}</span>
                      {w.cards.length > 0 && (
                        <span className="flex -space-x-3" role="group" aria-label="Комбинация победителя">
                          {w.cards.map((c) => (
                            <span key={c.r + '-' + c.s} role="img" aria-label={cardLabel(c)} className="block">
                              <CardFace c={c} size="xs" className="!w-8 !h-11" glow="gold" />
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gold-300/90">{w.handName}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {outSeats.length > 0 && (
        <p className="mx-auto w-full max-w-[1100px] truncate text-center text-sm text-[color:var(--muted)]">
          выбыли: {outSeats.map((s) => s.name).join(', ')}
        </p>
      )}

      {/* ==================== ваши карты ==================== */}
      <div className="flex flex-col items-center gap-1">
        {you.hole.length > 0 ? (
          <div
            className={[
              'flex items-center justify-center gap-2.5 rounded-2xl px-3 py-2 transition-colors sm:gap-3 sm:px-5 sm:py-2.5',
              you.canAct ? 'bg-gold-400/[.07] shadow-glowgold' : '',
            ].join(' ')}
          >
            {you.hole.map((c, i) => (
              <motion.div
                key={c.r + '-' + c.s + '-' + i}
                initial={reduce ? false : { opacity: 0, y: 26, scale: 0.88, rotate: 5 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : i * 0.06, ease: EASE }}
              >
                <span role="img" aria-label={cardLabel(c)} className="block">
                  <CardFace c={c} size="lg" glow={you.canAct ? 'gold' : null} className={you.canAct ? 'playable' : ''} />
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-[color:var(--line)] px-4 py-3 text-sm text-[color:var(--muted)]">
            Карты придут, когда начнётся раздача
          </p>
        )}

        {/* своя статистика */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          <span className="text-[color:var(--muted)]">
            фишки <b className="tnum font-semibold text-[color:var(--text)]">{you.chips}</b>
          </span>
          <span className="text-[color:var(--muted)]">
            в ставке <b className="tnum font-semibold text-[color:var(--text)]">{you.myBet}</b>
          </span>
          <span className="text-[color:var(--muted)]">
            к доплате{' '}
            <b className="tnum font-semibold text-gold-300">{you.callAmount}</b>
          </span>
        </div>
      </div>

      {/* ==================== панель действий ==================== */}
      <div className="panel mx-auto w-full max-w-[1100px] p-3 sm:p-4">
        <p
          className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold text-[color:var(--text)]"
          aria-live="polite"
        >
          {you.canAct ? (
            <IconBolt className="h-4 w-4 shrink-0 text-gold-300" />
          ) : (
            <IconTimer className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
          )}
          {statusText}
        </p>

        <div className="flex flex-col gap-2.5">
          {/* Пас + Чек/Уравнять */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!you.canAct}
              onClick={() => act('fold')}
              className={'btn-ghost min-h-[44px] cursor-pointer ' + FOCUS}
            >
              Пас
            </button>
            {you.callAmount > 0 ? (
              <button
                type="button"
                disabled={!you.canAct}
                onClick={() => act('call')}
                className={'btn-gold min-h-[44px] cursor-pointer ' + FOCUS}
              >
                Уравнять <span className="tnum">{you.callAmount}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!you.canAct}
                onClick={() => act('check')}
                className={'btn-gold min-h-[44px] cursor-pointer ' + FOCUS}
              >
                Чек
              </button>
            )}
          </div>

          {/* Повышение */}
          {canRaise && (
            <>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="raise-range"
                  className="flex items-baseline justify-between gap-2 text-sm text-[color:var(--muted)]"
                >
                  <span>Повысить до</span>
                  <span className="tnum text-[color:var(--text)]">
                    {raiseVal} <span className="text-gold-300">(+{raiseExtra})</span>
                  </span>
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    id="raise-range"
                    type="range"
                    min={minTo}
                    max={maxTo}
                    step={1}
                    value={raiseVal}
                    disabled={!you.canAct || forcedAllIn}
                    onChange={(e) => setRaiseTo(Number(e.currentTarget.value))}
                    className={
                      'h-[44px] min-w-0 flex-1 cursor-pointer accent-gold-400 ' +
                      'focus-visible:ring-2 focus-visible:ring-gold-400/50 focus-visible:outline-none ' +
                      'disabled:cursor-not-allowed disabled:opacity-40'
                    }
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Сумма повышения"
                    min={minTo}
                    max={maxTo}
                    value={raiseShown}
                    disabled={!you.canAct || forcedAllIn}
                    onChange={(e) => onRaiseInput(e.currentTarget.value)}
                    onBlur={() => setRaiseText(null)}
                    className={
                      'tnum w-[88px] shrink-0 rounded-lg border border-[color:var(--line)] bg-black/30 px-2 py-2.5 ' +
                      'text-center text-base text-[color:var(--text)] outline-none transition ' +
                      'focus:border-gold-400/70 focus-visible:ring-2 focus-visible:ring-gold-400/50 ' +
                      'disabled:cursor-not-allowed disabled:opacity-40'
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!you.canAct || forcedAllIn}
                    onClick={() => setRaiseTo(minTo)}
                    className={'btn-ghost min-h-[44px] cursor-pointer !px-4 !text-sm ' + FOCUS}
                  >
                    Минимум
                  </button>
                  <button
                    type="button"
                    disabled={!you.canAct}
                    onClick={() => setRaiseTo(maxTo)}
                    className={'btn-ghost min-h-[44px] cursor-pointer !px-4 !text-sm ' + FOCUS}
                  >
                    Всё <span className="tnum">({maxTo})</span>
                  </button>
                  <button
                    type="button"
                    disabled={!you.canAct}
                    onClick={() => act('raise', raiseVal)}
                    className={
                      'btn-gold min-h-[44px] flex-1 cursor-pointer sm:flex-none sm:!px-8 ' + FOCUS
                    }
                  >
                    Повысить до <span className="tnum">{raiseVal}</span>
                  </button>
                </div>
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                {forcedAllIn
                  ? 'Осталась одна ставка — только все фишки.'
                  : `Диапазон повышения: от ${minTo} до ${maxTo}.`}
              </p>
            </>
          )}

          {!you.canAct && (
            <p className="text-sm text-[color:var(--muted)]">
              {view.phase === 'lobby'
                ? 'Партия ещё не началась — ждём, пока хост запустит раздачу.'
                : 'Кнопки станут активны, когда дойдёт ваш ход.'}
            </p>
          )}
        </div>
      </div>

      {/* ==================== конец матча ==================== */}
      <AnimatePresence>
        {view.matchWinner && (
          <motion.div
            className="panel mx-auto flex w-full max-w-[1100px] flex-col items-center gap-3 p-5 text-center"
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: reduce ? 0 : 0.34, ease: EASE }}
            role="status"
          >
            <span className="chip !border-gold-400/50 !text-sm !text-gold-300">
              <IconCrown className="h-4 w-4" />
              игра окончена
            </span>
            <p className="font-display text-2xl font-bold text-gold-300">
              {matchWinnerSeat?.isYou ? 'Вы забираете матч' : `${matchWinnerSeat?.name ?? 'Игрок'} забирает матч`}
            </p>
            <button
              type="button"
              onClick={() => act('restart')}
              className={'btn-gold min-h-[44px] cursor-pointer !px-8 ' + FOCUS}
            >
              <IconRefresh className="h-4 w-4" />
              Начать заново
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== лог ==================== */}
      {logLines.length > 0 && (
        <div className="panel mx-auto w-full max-w-[1100px] p-3 sm:p-3.5">
          <p className="mb-1 text-sm font-semibold uppercase tracking-[.14em] text-gold-300/70">Ход раздачи</p>
          <ol className="space-y-0.5">
            {logLines.map((line, i) => (
              <li
                key={i}
                // .log-line из дизайн-системы задаёт 13px — поднимаем до 14px,
                // минимальный читаемый размер в этом проекте.
                className={'log-line !text-sm truncate rounded px-1 transition-colors ' + HOVER + 'bg-white/[.04]'}
              >
                {line}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default PokerTable;
