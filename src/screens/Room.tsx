import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionHandle } from '../lib/host';
import type { ChatLine, LobbyInfo, View } from '../lib/types';
import Chat from '../components/Chat';
import AdminPanel from '../components/AdminPanel';
import { IconCards, IconBolt, IconCopy, IconGear, IconSoundOff, IconSoundOn, IconTimer, IconX } from '../components/Icons';
import Lobby from './Lobby';
import { PokerTable } from './PokerTable';
import { DurakTable } from './DurakTable';

type Props = {
  session: SessionHandle | null;
  lobby: LobbyInfo | null;
  view: View | null;
  chat: ChatLine[];
  soundOn: boolean;
  onSound: (v: boolean) => void;
  onLeave: () => void;
};

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-400/50';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной путь ниже */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function Room(p: Props) {
  const { session, lobby, view, chat, soundOn, onSound, onLeave } = p;
  const isHost = !!session?.isHost;
  const code = lobby?.code ?? '';

  const [adminOpen, setAdminOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const copyCode = async () => {
    if (!code) return;
    const ok = await copyText(code);
    setCopyState(ok ? 'ok' : 'err');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState('idle'), 2000);
  };

  /* Лобби, пока партия не началась, иначе — стол по типу игры. */
  let content: ReactNode;
  if (!view || (lobby && !lobby.started)) {
    content = lobby ? (
      <Lobby
        lobby={lobby}
        isHost={isHost}
        onStart={() => session?.admin({ cmd: 'start' })}
        onAddBot={() => session?.admin({ cmd: 'addBot' })}
      />
    ) : (
      <div className="panel fade-in mx-auto mt-10 w-full max-w-md p-8 text-center">
        <IconTimer className="mx-auto mb-3 h-8 w-8 text-gold-300" />
        <p className="text-base text-[color:var(--text)]">Подключаемся к комнате…</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Код комнаты появится через пару секунд.</p>
      </div>
    );
  } else if (view.game === 'poker') {
    content = <PokerTable view={view} onAction={(a, v) => session?.action(a, undefined, v)} />;
  } else {
    content = <DurakTable view={view} onAction={(a, c) => session?.action(a, c)} />;
  }

  const copyLabel = copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Не вышло' : 'Копировать';

  return (
    <div className="flex min-h-full flex-col">
      {/* ---------------- шапка ---------------- */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-felt-800/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <span className="hidden font-display text-lg tracking-[.28em] text-gold-300 lg:block">КОЗЫРЬ</span>
          {lobby && (
            <span
              className="hidden items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white/[.04] px-3 py-1
                         text-sm font-semibold text-[color:var(--text)] md:inline-flex"
            >
              {lobby.game === 'poker' ? <IconCards className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
              {lobby.game === 'poker' ? `Покер ${lobby.sb}/${lobby.bb}` : 'Дурак'}
            </span>
          )}

          {/* Код комнаты — главное, что игроки диктуют друг другу */}
          <div
            className="flex items-center gap-2 rounded-xl border border-gold-400/45 bg-gold-400/[.08] px-3 py-1.5 shadow-glowgold"
          >
            <div className="leading-none">
              <p className="text-sm font-semibold uppercase tracking-[.14em] text-gold-300/80">код комнаты</p>
              <p className="tnum font-display text-2xl font-bold leading-tight text-gold-300 sm:text-3xl">
                {code || '····'}
              </p>
            </div>
            <button
              type="button"
              onClick={copyCode}
              disabled={!code}
              aria-label="Скопировать код комнаты"
              className={
                'btn-gold min-h-[44px] min-w-[44px] cursor-pointer !px-3 sm:!px-4 ' + FOCUS + ' ' +
                (copyState === 'ok'
                  ? '!border-emerald-400 !bg-emerald-500/25 !text-emerald-100'
                  : copyState === 'err'
                    ? '!border-red-400 !bg-red-500/25 !text-red-100'
                    : '')
              }
            >
              <IconCopy className="h-5 w-5" />
              <span className="hidden sm:inline">{copyLabel}</span>
            </button>
            <span role="status" className="sr-only">
              {copyState === 'ok' ? 'Код скопирован' : copyState === 'err' ? 'Не удалось скопировать' : ''}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSound(!soundOn)}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
              className={
                'btn-ghost min-h-[44px] min-w-[44px] cursor-pointer !px-3 ' + FOCUS + ' ' +
                (soundOn ? 'text-gold-300' : 'text-[color:var(--muted)]')
              }
            >
              {soundOn ? <IconSoundOn className="h-5 w-5" /> : <IconSoundOff className="h-5 w-5" />}
            </button>
            {isHost && (
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                aria-label="Открыть админ-панель"
                className={'btn-ghost min-h-[44px] min-w-[44px] cursor-pointer !px-3 ' + FOCUS}
              >
                <IconGear className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              aria-label="Выйти из комнаты"
              className={'btn-danger min-h-[44px] min-w-[44px] cursor-pointer !px-3 sm:!px-5 ' + FOCUS}
            >
              <IconX className="h-5 w-5" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- стол + чат ---------------- */}
      <main className="mx-auto flex w-full max-w-[1440px] min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4 lg:px-4 lg:py-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto">
          {content}
        </div>

        <section className="w-full shrink-0 lg:w-[336px]" aria-label="Чат комнаты">
          {/* На телефоне чат живёт под столом и не перекрывает его */}
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            aria-expanded={chatOpen}
            aria-controls="room-chat"
            className={
              'btn-ghost min-h-[44px] w-full cursor-pointer justify-between !px-4 lg:hidden ' + FOCUS
            }
          >
            <span>Чат{chat.length > 0 ? ` · ${chat.length}` : ''}</span>
            <span className="text-sm text-[color:var(--muted)]">{chatOpen ? 'скрыть' : 'показать'}</span>
          </button>
          <div
            id="room-chat"
            className={
              (chatOpen ? 'flex' : 'hidden') +
              ' h-[46vh] min-h-[240px] max-h-[60vh] flex-col lg:flex lg:h-[calc(100dvh-100px)] lg:max-h-none lg:min-h-0'
            }
          >
            <Chat lines={chat} onSend={(text) => session?.chat(text)} isHost={isHost} />
          </div>
        </section>
      </main>

      {isHost && adminOpen && lobby && (
        <AdminPanel lobby={lobby} onAdmin={(cmd) => session?.admin(cmd)} onClose={() => setAdminOpen(false)} />
      )}
    </div>
  );
}
