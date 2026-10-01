import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AdminCmd, DurakMode, LobbyInfo } from '../lib/types';
import { IconBot, IconBolt, IconCards, IconFlag, IconPlus, IconUsers, IconX } from './Icons';

type Props = {
  lobby: LobbyInfo;
  onAdmin: (cmd: AdminCmd) => void;
  onClose: () => void;
};

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-400/50';

/* ------------------------------------------------------------------ */
/* Сворачиваемая секция                                                */
/* ------------------------------------------------------------------ */
function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-[color:var(--line)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          'flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-left ' +
          'text-[15px] font-semibold uppercase tracking-[.1em] text-gold-300 ' +
          'hover:bg-white/[.05] ' + FOCUS
        }
      >
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-sm font-normal normal-case tracking-normal text-[color:var(--muted)]">
          {open ? 'свернуть' : 'открыть'}
        </span>
      </button>
      {open && <div className="space-y-2 pb-4 pt-1">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Кнопка с подтверждением в два шага (без window.confirm)              */
/* ------------------------------------------------------------------ */
function ConfirmBtn({
  label,
  confirmLabel,
  onConfirm,
  icon,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  icon?: ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  // Подтверждение «сгорает», если хост передумал.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (armed) {
            setArmed(false);
            onConfirm();
          } else {
            setArmed(true);
          }
        }}
        className={
          'btn-danger min-h-[44px] cursor-pointer ' +
          (armed ? '!border-red-400 !bg-red-500/25 !text-red-100 ' : '') + FOCUS
        }
      >
        {icon}
        {armed ? confirmLabel : label}
      </button>
      {armed && (
        <button
          type="button"
          onClick={() => setArmed(false)}
          className={'btn-ghost min-h-[44px] cursor-pointer ' + FOCUS}
        >
          Отмена
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Панель                                                              */
/* ------------------------------------------------------------------ */
export function AdminPanel({ lobby, onAdmin, onClose }: Props) {
  const [visible, setVisible] = useState(true);
  const [sb, setSb] = useState(() => String(lobby.sb));
  const [bb, setBb] = useState(() => String(lobby.bb));

  useEffect(() => {
    setSb(String(lobby.sb));
    setBb(String(lobby.bb));
  }, [lobby.sb, lobby.bb]);

  // Esc закрывает панель. Слушаем в фазе capture на document: обработчик общего
  // уровня (выход из комнаты по Esc) повешен на window и сработал бы раньше.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setVisible(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const close = () => setVisible(false);

  const sbNum = Number(sb);
  const bbNum = Number(bb);
  const blindsOk = Number.isInteger(sbNum) && Number.isInteger(bbNum) && sbNum >= 1 && bbNum >= 2 && bbNum > sbNum;

  const freeSeats = Math.max(0, lobby.maxSeats - lobby.seats.length);
  const humans = lobby.seats.filter((s) => !s.isHost);

  return (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          key="admin"
          className="fixed inset-0 z-40 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть админ-панель"
            className="absolute inset-0 h-full w-full cursor-pointer bg-black/70"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Админ-панель комнаты"
            className={
              'relative flex h-full w-full max-w-[420px] flex-col border-l border-gold-400/30 ' +
              'bg-felt-900/95 shadow-panel backdrop-blur'
            }
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: 'easeOut', duration: 0.24 }}
          >
            <header className="flex items-center gap-3 border-b border-[color:var(--line)] px-4 py-3">
              <h2 className="font-display text-lg text-gold-300">Админ-панель</h2>
              <span className="tnum text-sm text-[color:var(--muted)]">комната {lobby.code}</span>
              <button
                type="button"
                onClick={close}
                autoFocus
                aria-label="Закрыть админ-панель"
                className={'btn-ghost ml-auto min-h-[44px] min-w-[44px] cursor-pointer !px-3 ' + FOCUS}
              >
                <IconX className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
              {/* ---------------- игроки ---------------- */}
              <Section title="Игроки" icon={<IconUsers className="h-4 w-4" />}>
                <ul className="space-y-2">
                  {lobby.seats.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[color:var(--line)] bg-black/20 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-[color:var(--text)]">
                          {s.name}
                          {s.isHost && <span className="ml-2 text-sm font-medium text-gold-300">хост</span>}
                          {s.bot && <span className="ml-2 text-sm font-medium text-[color:var(--muted)]">бот</span>}
                        </p>
                        <p className="flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
                          <span
                            className={
                              s.connected ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-[color:var(--muted)]'
                            }
                            aria-hidden
                          />
                          {s.connected ? 'в сети' : 'отключён'}
                        </p>
                      </div>
                      {s.isHost ? (
                        <span className="px-1 text-sm text-[color:var(--muted)]">это вы</span>
                      ) : (
                        <ConfirmBtn
                          label="Исключить"
                          confirmLabel="Точно исключить"
                          onConfirm={() => onAdmin({ cmd: 'kick', seatId: s.id })}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-[color:var(--muted)]">
                  Свободных мест: {freeSeats} из {lobby.maxSeats}
                </p>
              </Section>

              {/* ---------------- партия ---------------- */}
              <Section title="Партия" icon={<IconBolt className="h-4 w-4" />}>
                <button
                  type="button"
                  onClick={() => onAdmin({ cmd: 'start' })}
                  className={'btn-gold min-h-[44px] w-full cursor-pointer ' + FOCUS}
                >
                  <IconBolt className="h-4 w-4" />
                  Начать игру
                </button>
                <button
                  type="button"
                  onClick={() => onAdmin({ cmd: 'addBot' })}
                  disabled={freeSeats === 0}
                  className={'btn-ghost min-h-[44px] w-full cursor-pointer ' + FOCUS}
                >
                  <IconBot className="h-4 w-4" />
                  Добавить бота
                </button>
                <button
                  type="button"
                  onClick={() => onAdmin({ cmd: 'endHand' })}
                  disabled={!lobby.started}
                  className={'btn-ghost min-h-[44px] w-full cursor-pointer ' + FOCUS}
                >
                  <IconFlag className="h-4 w-4" />
                  Закончить раздачу
                </button>
                <button
                  type="button"
                  onClick={() => onAdmin({ cmd: 'topUp' })}
                  disabled={!lobby.started}
                  className={'btn-ghost min-h-[44px] w-full cursor-pointer ' + FOCUS}
                >
                  <IconPlus className="h-4 w-4" />
                  Добавить фишки
                </button>
                <p className="text-sm text-[color:var(--muted)]">
                  {lobby.started
                    ? 'Партия идёт — раздачу можно завершить досрочно.'
                    : 'Партия ещё не начата: доступны старт и боты.'}
                </p>
              </Section>

              {/* ---------------- настройки ---------------- */}
              {lobby.game === 'durak' ? (
                <Section title="Режим дурака" icon={<IconCards className="h-4 w-4" />}>
                  <div role="group" aria-label="Режим игры в дурака" className="grid grid-cols-2 gap-2">
                    {(['classic', 'transfer'] as DurakMode[]).map((m) => {
                      const active = lobby.mode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={active}
                          onClick={() => onAdmin({ cmd: 'setMode', v: m })}
                          className={
                            'min-h-[44px] cursor-pointer rounded-lg border px-2 text-[15px] font-semibold transition-colors ' +
                            FOCUS + ' ' +
                            (active
                              ? 'border-gold-400/70 bg-gold-400/15 text-gold-300'
                              : 'border-[color:var(--line)] bg-white/[.03] text-[color:var(--text)] hover:bg-white/[.08]')
                          }
                        >
                          {m === 'classic' ? 'Подкидной' : 'Переводной'}
                        </button>
                      );
                    })}
                  </div>
                </Section>
              ) : (
                <Section title="Блайнды" icon={<IconCards className="h-4 w-4" />}>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="field">
                      <span className="text-sm font-semibold uppercase tracking-[.1em] text-gold-300/80">Малый</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={sb}
                        onChange={(e) => setSb(e.target.value)}
                        aria-label="Малый блайнд"
                        className={'w-full rounded-lg border border-[color:var(--line)] bg-black/30 px-3 py-3 text-base text-[color:var(--text)] focus:border-gold-400/70 ' + FOCUS}
                      />
                    </label>
                    <label className="field">
                      <span className="text-sm font-semibold uppercase tracking-[.1em] text-gold-300/80">Большой</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={2}
                        step={1}
                        value={bb}
                        onChange={(e) => setBb(e.target.value)}
                        aria-label="Большой блайнд"
                        className={'w-full rounded-lg border border-[color:var(--line)] bg-black/30 px-3 py-3 text-base text-[color:var(--text)] focus:border-gold-400/70 ' + FOCUS}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!blindsOk}
                    onClick={() => onAdmin({ cmd: 'setBlinds', sb: sbNum, bb: bbNum })}
                    className={'btn-ghost min-h-[44px] w-full cursor-pointer ' + FOCUS}
                  >
                    Применить блайнды
                  </button>
                  <p className="text-sm text-[color:var(--muted)]">
                    Малый — всегда меньше большого. Сейчас {lobby.sb} / {lobby.bb}.
                  </p>
                </Section>
              )}

              {/* ---------------- опасная зона ---------------- */}
              <Section title="Опасная зона" defaultOpen={false}>
                <div className="rounded-xl border border-red-500/30 bg-red-950/25 p-3">
                  <p className="mb-2 text-sm text-red-200">
                    Действия необратимы: партия остановится, все вернутся в лобби.
                  </p>
                  <ConfirmBtn
                    label="Завершить игру"
                    confirmLabel="Точно завершить игру"
                    onConfirm={() => onAdmin({ cmd: 'endGame' })}
                    icon={<IconX className="h-4 w-4" />}
                  />
                </div>
                {humans.length > 0 && (
                  <p className="text-sm text-[color:var(--muted)]">
                    Исключение игрока — кнопка «Исключить» в списке игроков выше: сначала она
                    подсвечивается, затем подтверждается.
                  </p>
                )}
              </Section>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AdminPanel;
