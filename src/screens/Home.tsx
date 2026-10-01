/**
 * Главный экран «КОЗЫРЯ».
 *
 * Смысловая структура: кто вы (имя) → во что играем (игра и режим дурака) →
 * как начать (создать комнату / войти по коду / сыграть с ботами).
 * Отдельно — способ связи и честное пояснение, что он действительно делает:
 * обещать то, чего игра не гарантирует, здесь нельзя.
 *
 * Правила, которые файл соблюдает намеренно:
 *   — базовый шрифт 16px, мелкий текст не меньше 14px;
 *   — золото живёт в заголовках, рамках и на заливке, но не в мелком тексте;
 *   — зоны нажатия не меньше 44px, курсор-указатель на всём кликабельном;
 *   — эффекты наведения включаются только там, где есть настоящий курсор,
 *     иначе на телефоне они залипают после тапа;
 *   — фокус с клавиатуры виден всегда: кольцо не отключается нигде;
 *   — анимируются только transform и opacity, высоты не трогаем.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  IconBolt,
  IconBot,
  IconCards,
  IconFlag,
  IconPlus,
  IconSend,
  IconSoundOff,
  IconSoundOn,
  IconUsers,
  SuitIcon,
} from '../components/Icons';
import { isValidCode, normalizeCode } from '../lib/randomCode';
import type { DurakMode, GameKind } from '../lib/types';

type Props = {
  name: string;
  onName: (v: string) => void;
  netKind: 'local' | 'webrtc';
  onNetKind: (v: 'local' | 'webrtc') => void;
  signal: { label: string; own: boolean };
  soundOn: boolean;
  onSound: (v: boolean) => void;
  onCreate: (g: GameKind, m: DurakMode, n: string) => void;
  onJoin: (code: string, n: string) => void;
  onQuick: (g: GameKind, m: DurakMode, n: string) => void;
};

const cx = (...parts: (string | false)[]) => parts.filter(Boolean).join(' ');

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ анимация */

const fadeUp = (reduce: boolean): Variants =>
  reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      };

const popIn = (reduce: boolean): Variants =>
  reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, y: -8, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: EASE } },
      };

const stagger = (reduce: boolean, step: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: reduce ? 0 : step } },
});

/* ------------------------------------------------------------------ классы */

/** Кольцо фокуса. Нигде не отключаем outline — только задаём его. */
const RING = 'focus-visible:[outline:2px_solid_var(--gold)] focus-visible:[outline-offset:2px]';
/** То же, но радио-инпут скрыт, а кольцо нужно на следующем за ним элементе. */
const PEER_RING =
  'peer-focus-visible:[outline:2px_solid_var(--gold)] peer-focus-visible:[outline-offset:2px]';

/** Подписи полей: 14px, спокойный цвет — не золото в мелком тексте. */
const LABEL = 'text-[14px] font-semibold normal-case tracking-normal text-[color:var(--muted)]';

const INPUT = cx('min-h-[48px] text-[16px] w-full', RING);

/* ------------------------------------------------------------------ иконки */

const ICON_MD = 'h-5 w-5 shrink-0';
const ICON_LG = 'h-6 w-6';

/**
 * Галочка «выбрано». В Icons.tsx такого знака нет, а выбранный вариант должен
 * быть отмечен не только цветом; рисуем в той же технике, что и остальные
 * знаки набора: viewBox 24, обводка 2, currentColor, aria-hidden.
 */
function CheckMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

/** Точка-переключатель: цвет не единственный носитель состояния, рядом всегда текст. */
function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200',
        on ? 'border-gold-400' : 'border-[color:var(--line)]',
      )}
    >
      <span
        className={cx(
          'h-2.5 w-2.5 rounded-full bg-gold-400 transition-transform duration-200',
          on ? 'scale-100' : 'scale-0',
        )}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ данные */

const GAMES: { v: GameKind; title: string; note: string; icon: ReactNode }[] = [
  {
    v: 'poker',
    title: 'Техасский покер',
    note: 'Блайны, рейзы и разбор комбинаций в конце.',
    icon: <IconCards className={ICON_LG} />,
  },
  {
    v: 'durak',
    title: 'Дурак',
    note: 'Атака, защита и козырь — до последней карты.',
    icon: <IconFlag className={ICON_LG} />,
  },
];

const MODES: { v: DurakMode; title: string; note: string }[] = [
  { v: 'classic', title: 'Классический', note: 'Без переноса: проигравший берёт взятку себе.' },
  { v: 'transfer', title: 'С переносом', note: 'Можно сбросить одну карту другому игроку.' },
];

const NETS: { v: 'local' | 'webrtc'; label: string; icon: ReactNode }[] = [
  { v: 'local', label: 'В этом браузере', icon: <IconUsers className={ICON_MD} /> },
  { v: 'webrtc', label: 'Через интернет', icon: <IconBolt className={ICON_MD} /> },
];

/* ------------------------------------------------------- карточка выбора игры */

type GameCardProps = {
  id: string;
  kind: GameKind;
  title: string;
  note: string;
  icon: ReactNode;
  checked: boolean;
  canHover: boolean;
  onSelect: () => void;
  children?: ReactNode;
};

function GameCard({ id, kind, title, note, icon, checked, canHover, onSelect, children }: GameCardProps) {
  const reduce = useReducedMotion() === true;
  const pop = popIn(reduce);

  return (
    <div className="min-w-0">
      <input
        id={id}
        type="radio"
        name="game"
        value={kind}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <motion.div
        onClick={onSelect}
        animate={checked ? { scale: 1.02 } : { scale: 1 }}
        whileHover={canHover ? { y: -2 } : undefined}
        transition={checked ? { type: 'spring', stiffness: 420, damping: 20 } : { duration: 0.2, ease: EASE }}
        className={cx(
          'relative flex min-w-0 flex-col rounded-2xl border p-1.5 transition-colors duration-200',
          checked
            ? 'border-gold-400/80 bg-gold-400/10 shadow-glowgold'
            : 'border-[color:var(--line)] bg-black/25',
          canHover ? 'cursor-pointer' : '',
          canHover ? 'hover:border-gold-400/40' : '',
          PEER_RING,
        )}
      >
        <label htmlFor={id} className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2">
          <span
            className={cx(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200',
              checked ? 'border-gold-400/50 bg-gold-400/20 text-gold-300' : 'border-[color:var(--line)] text-gold-300/80',
            )}
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-medium leading-tight text-[color:var(--text)]">
              {title}
            </span>
            <span className="mt-1 block text-[14px] leading-snug text-[color:var(--muted)]">{note}</span>
          </span>
          <span
            aria-hidden
            className={cx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-200',
              checked ? 'border-gold-400 bg-gold-400/20 text-gold-300' : 'border-[color:var(--line)] text-transparent',
            )}
          >
            <CheckMark className="h-4 w-4" />
          </span>
        </label>

        {children ? (
          <motion.div
            variants={pop}
            initial="hidden"
            animate="show"
            className="mt-1.5 border-t border-[color:var(--line)] px-2.5 pb-2.5 pt-3"
          >
            {children}
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------- режим дурака (в карточке) */

function ModePicker({ mode, onChange, canHover }: { mode: DurakMode; onChange: (m: DurakMode) => void; canHover: boolean }) {
  const reduce = useReducedMotion() === true;
  const pop = popIn(reduce);

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={cx(LABEL, 'mb-2 block')}>Режим дурака</legend>
      <motion.div variants={pop} initial="hidden" animate="show" className="grid gap-2">
        {MODES.map((o) => {
          const on = mode === o.v;
          return (
            <label
              key={o.v}
              className={cx(
                'flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-200',
                on
                  ? 'border-gold-400/70 bg-gold-400/10'
                  : 'border-[color:var(--line)] bg-black/20',
                canHover ? 'cursor-pointer' : '',
                canHover ? 'hover:border-gold-400/40' : '',
                // Радио скрыт, поэтому кольцо фокуса вешаем на строку через focus-within.
                'focus-within:[outline:2px_solid_var(--gold)] focus-within:[outline-offset:2px]',
              )}
            >
              <input
                type="radio"
                name="durak-mode"
                value={o.v}
                checked={on}
                onChange={() => onChange(o.v)}
                className="sr-only"
              />
              <RadioDot on={on} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold leading-tight text-[color:var(--text)]">
                  {o.title}
                </span>
                <span className="mt-0.5 block text-[14px] leading-snug text-[color:var(--muted)]">{o.note}</span>
              </span>
            </label>
          );
        })}
      </motion.div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ главный */

export default function Home(p: Props) {
  const [game, setGame] = useState<GameKind>('poker');
  const [mode, setMode] = useState<DurakMode>('classic');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);

  // Ссылка-приглашение выглядит как .../#427: код комнаты лежит в адресе.
  // Без этого переход по ссылке откроет главный экран с пустым полем, и
  // игрок решит, что ссылка сломалась. Считываем код один раз при входе и
  // убираем его из адреса, чтобы следующая копия ссылки не несла чужой код.
  useEffect(() => {
    const fromLink = normalizeCode(window.location.hash.replace(/^#/, ''));
    if (!isValidCode(fromLink)) return;
    setCode(fromLink);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // Системная настройка «меньше движения»: сдвиги и пружины выключаем,
  // остаётся только прозрачность.
  const reduce = useReducedMotion() === true;
  // Настоящий курсор есть не везде. Без этой проверки hover-эффекты залипают
  // на телефоне после тапа — поэтому и CSS-классы, и whileHover идут через неё.
  const [canHover] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover)').matches,
  );

  const root = stagger(reduce, 0.07);
  const column = stagger(reduce, 0.05);
  const block = fadeUp(reduce);

  const playerName = p.name.trim() || 'Игрок';
  const codeOk = isValidCode(code);
  const codeBad = codeTouched && !codeOk;

  const join = () => {
    if (codeOk) p.onJoin(code, playerName);
    else setCodeTouched(true);
  };

  return (
    <motion.div
      variants={root}
      initial="hidden"
      animate="show"
      className="flex flex-1 flex-col items-center px-4 pb-10 pt-4 sm:px-6"
    >
      <div className="flex w-full max-w-5xl flex-col">
        {/* Угол: только звук. Назад с главной некуда — это начало. */}
        <motion.header variants={block} className="flex items-center justify-between gap-3">
          <span className="chip text-[14px]">
            <SuitIcon s={0} className="h-4 w-4" />
            Без регистрации
          </span>
          <button
            type="button"
            onClick={() => p.onSound(!p.soundOn)}
            aria-pressed={p.soundOn}
            className={cx('btn-ghost min-h-[44px] cursor-pointer rounded-full px-4', canHover ? 'hover:border-gold-400/60' : '', RING)}
          >
            {p.soundOn ? <IconSoundOn className={ICON_MD} /> : <IconSoundOff className={ICON_MD} />}
            <span className="text-[14px] font-semibold">{p.soundOn ? 'Звук вкл' : 'Звук выкл'}</span>
          </button>
        </motion.header>

        {/* Логотип */}
        <motion.section variants={block} className="flex flex-col items-center gap-3 py-7 text-center sm:py-10">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-300">
            <SuitIcon s={0} className="h-7 w-7" />
          </span>
          <h1 className="bg-gradient-to-b from-gold-300 to-gold-500 bg-clip-text font-display text-5xl font-bold leading-[1.05] tracking-tight text-transparent sm:text-6xl">
            КОЗЫРЬ
          </h1>
          <span aria-hidden className="h-px w-24 bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
          <p className="max-w-[46ch] text-[16px] leading-relaxed text-[color:var(--muted)]">
            Покер и дурак по сети. Без регистрации, аккаунтов и установки: откройте страницу — и зовите друзей.
          </p>
        </motion.section>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          {/* Левая колонка: игрок и игра */}
          <motion.div variants={column} className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <motion.section variants={block} className="panel flex min-w-0 flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-[19px] font-medium leading-tight text-[color:var(--text)]">Кто вы</h2>
              <div className="field">
                <label htmlFor="kozyr-name" className={LABEL}>
                  Ваше имя
                </label>
                <input
                  id="kozyr-name"
                  name="player-name"
                  value={p.name}
                  onChange={(e) => p.onName(e.target.value)}
                  maxLength={16}
                  placeholder="Например, Соня"
                  autoComplete="nickname"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint="done"
                  className={INPUT}
                />
              </div>
              <p className="text-[14px] leading-snug text-[color:var(--muted)]">
                Под этим именем вас увидят за столом. Имя запоминается в этом браузере.
              </p>
            </motion.section>

            <motion.section variants={block} className="panel flex min-w-0 flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-[19px] font-medium leading-tight text-[color:var(--text)]">
                Во что играем
              </h2>
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="sr-only">Выбор игры</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {GAMES.map((g) => (
                    <GameCard
                      key={g.v}
                      id={`game-${g.v}`}
                      kind={g.v}
                      title={g.title}
                      note={g.note}
                      icon={g.icon}
                      checked={game === g.v}
                      canHover={canHover}
                      onSelect={() => setGame(g.v)}
                    >
                      {g.v === 'durak' ? (
                        <ModePicker mode={mode} onChange={setMode} canHover={canHover} />
                      ) : null}
                    </GameCard>
                  ))}
                </div>
              </fieldset>
            </motion.section>
          </motion.div>

          {/* Правая колонка: три способа начать и способ связи */}
          <motion.div variants={column} className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <motion.section variants={block} className="panel flex min-w-0 flex-col gap-4 p-4 sm:p-5">
              <h2 className="font-display text-[19px] font-medium leading-tight text-[color:var(--text)]">
                Как начать
              </h2>

              {/* 1. Главное действие */}
              <motion.button
                type="button"
                onClick={() => p.onCreate(game, mode, playerName)}
                whileHover={canHover ? { y: -1 } : undefined}
                transition={{ duration: 0.18, ease: EASE }}
                className={cx('btn-gold min-h-[52px] w-full cursor-pointer text-left', RING)}
              >
                <IconPlus className={ICON_MD} />
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-medium leading-tight">Создать комнату</span>
                  <span className="mt-0.5 block text-[14px] font-normal leading-tight text-felt-900/80">
                    Вы — хост, друзьям понадобится трёхзначный код
                  </span>
                </span>
              </motion.button>

              {/* 2. Вход по коду */}
              <div className="panel-inset flex flex-col gap-3 p-3 sm:p-4">
                <div className="flex items-center gap-2.5">
                  <IconUsers className={cx(ICON_MD, 'text-gold-300')} />
                  <h3 className="font-display text-[17px] font-medium leading-tight text-[color:var(--text)]">
                    Войти по коду
                  </h3>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="field min-w-0 flex-1">
                    <label htmlFor="kozyr-code" className={LABEL}>
                      Код комнаты
                    </label>
                    <input
                      id="kozyr-code"
                      name="room-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      onBlur={() => setCodeTouched(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          join();
                        }
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={3}
                      placeholder="000"
                      aria-invalid={codeBad || undefined}
                      aria-describedby={codeBad ? 'kozyr-code-err' : 'kozyr-code-hint'}
                      className={cx(
                        INPUT,
                        'tnum text-center text-[22px] tracking-[0.4em] indent-[0.4em]',
                        codeBad ? 'border-red-400/70' : '',
                      )}
                    />
                  </div>
                  <motion.button
                    type="button"
                    onClick={join}
                    disabled={!codeOk}
                    whileHover={canHover ? { y: -1 } : undefined}
                    transition={{ duration: 0.18, ease: EASE }}
                    className={cx('btn-ghost min-h-[48px] w-full cursor-pointer sm:w-auto', RING)}
                  >
                    <IconSend className={ICON_MD} />
                    <span className="text-[16px]">Войти</span>
                  </motion.button>
                </div>
                <p id="kozyr-code-hint" className="text-[14px] leading-snug text-[color:var(--muted)]">
                  Три цифры, которые показывает хост комнаты.
                </p>
                <p
                  id="kozyr-code-err"
                  role="status"
                  className={cx(codeBad ? 'text-[14px] font-semibold text-red-300' : 'sr-only')}
                >
                  {codeBad ? 'Комната — три цифры' : ''}
                </p>
              </div>

              {/* 3. Без сети */}
              <motion.button
                type="button"
                onClick={() => p.onQuick(game, mode, playerName)}
                whileHover={canHover ? { y: -1 } : undefined}
                transition={{ duration: 0.18, ease: EASE }}
                className={cx('btn-ghost min-h-[52px] w-full cursor-pointer text-left', RING)}
              >
                <IconBot className={ICON_MD} />
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-medium leading-tight text-[color:var(--text)]">
                    Сыграть с ботами
                  </span>
                  <span className="mt-0.5 block text-[14px] font-normal leading-tight text-[color:var(--muted)]">
                    Начинается сразу: без комнаты, кода и сети
                  </span>
                </span>
              </motion.button>
            </motion.section>

            {/* Способ связи — с честным пояснением */}
            <motion.section variants={block} className="panel flex min-w-0 flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-[19px] font-medium leading-tight text-[color:var(--text)]">
                Как связаться с друзьями
              </h2>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[color:var(--line)] bg-black/25 p-1.5">
                {NETS.map((t) => {
                  const on = p.netKind === t.v;
                  return (
                    <div key={t.v} className="min-w-0">
                      <input
                        id={`net-${t.v}`}
                        type="radio"
                        name="net-kind"
                        value={t.v}
                        checked={on}
                        onChange={() => p.onNetKind(t.v)}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={`net-${t.v}`}
                        className={cx(
                          'flex min-h-[56px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-2 text-center transition-colors duration-200',
                          on ? 'bg-gold-400/10 text-gold-300' : 'text-[color:var(--muted)]',
                          canHover ? 'hover:bg-white/[.05]' : '',
                          PEER_RING,
                        )}
                      >
                        {t.icon}
                        <span className="text-[14px] font-semibold leading-tight">{t.label}</span>
                      </label>
                    </div>
                  );
                })}
              </div>

              <div
                role="status"
                className="panel-inset flex flex-col gap-2 p-3.5 text-[14px] leading-relaxed text-[color:var(--muted)]"
              >
                {p.netKind === 'local' ? (
                  <p>Откройте эту же игру в других вкладках — они увидят друг друга. Сервер не нужен.</p>
                ) : (
                  <>
                    <p>
                      Игроки на разных устройствах.{' '}
                      <span className="text-[color:var(--text)]">Сервер сигнализации: {p.signal.label}</span>
                    </p>
                    {!p.signal.own ? (
                      <p className="text-[color:var(--text)]">
                        Это публичный сервер PeerJS — он чужой и может быть недоступен. Для постоянной игры поднимите
                        свой:{' '}
                        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[14px] text-gold-300">
                          npm run serve
                        </code>
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </motion.section>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
