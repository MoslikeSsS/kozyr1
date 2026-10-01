import { useCallback, useEffect, useRef, useState } from 'react';
import Home from './screens/Home';
import Room from './screens/Room';
import { HostCore, createGuestSession, type RoomCallbacks, type SessionHandle } from './lib/host';
import { play, setSound as setSoundEnabled } from './lib/sound';
import { getNetKind, setNetKind, describeSignal, type NetKind } from './lib/net';
import type { ChatLine, DurakMode, GameKind, LobbyInfo, View } from './lib/types';

type Toast = { id: number; text: string; tone: 'info' | 'err' | 'ok' };

const NAME_KEY = 'kozyr-name';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'room'>('home');
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [netKind, setKind] = useState<NetKind>(getNetKind());

  const sessionRef = useRef<SessionHandle | null>(null);
  const idRef = useRef(1);
  const chatId = useRef(1);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = idRef.current++;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const callbacks: RoomCallbacks = {
    onView: setView,
    onLobby: setLobby,
    onEv: (kind) => {
      // Звук на ключевые события партии; неизвестные не трогаем.
      if (kind === 'win') play('win');
      else if (kind === 'fold') play('fold');
      else if (kind === 'deal') play('deal');
      else if (kind === 'check') play('click');
    },
    onChat: (from, text, mine) => setChat((c) => [...c.slice(-80), { id: chatId.current++, from, text, mine }]),
    onToast: toast,
    onLeft: (reason) => {
      sessionRef.current = null;
      setSession(null);
      setView(null);
      setLobby(null);
      setScreen('home');
      toast(reason, 'err');
    },
  };

  const start = useCallback(
    (make: () => SessionHandle) => {
      sessionRef.current?.leave();
      const s = make();
      sessionRef.current = s;
      setSession(s);
      setChat([]);
      setView(null);
      setScreen('room');
    },
    [],
  );

  const createRoom = useCallback(
    (game: GameKind, mode: DurakMode, playerName: string) => {
      localStorage.setItem(NAME_KEY, playerName);
      setSoundEnabled(soundOn);
      start(
        () =>
          new HostCore(callbacks, {
            name: playerName,
            game,
            mode,
            withNet: true,
          }) as unknown as SessionHandle,
      );
    },
    [callbacks, soundOn, start],
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      localStorage.setItem(NAME_KEY, playerName);
      setSoundEnabled(soundOn);
      start(() => createGuestSession(code, playerName, callbacks));
    },
    [callbacks, soundOn, start],
  );

  const quickGame = useCallback(
    (game: GameKind, mode: DurakMode, playerName: string) => {
      localStorage.setItem(NAME_KEY, playerName);
      setSoundEnabled(soundOn);
      start(
        () =>
          new HostCore(callbacks, {
            name: playerName,
            game,
            mode,
            withNet: false,
          }) as unknown as SessionHandle,
      );
    },
    [callbacks, soundOn, start],
  );

  const leave = useCallback(() => {
    sessionRef.current?.leave();
    sessionRef.current = null;
    setSession(null);
    setView(null);
    setLobby(null);
    setScreen('home');
  }, []);

  const toggleSound = useCallback((on: boolean) => {
    setSoundOn(on);
    setSoundEnabled(on);
  }, []);

  const changeNet = useCallback((kind: NetKind) => {
    setNetKind(kind);
    setKind(kind);
  }, []);

  // Предупреждаем, если игрок закрывает вкладку посреди партии.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (screen === 'room' && view && !('phase' in view && view.phase === 'lobby')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [screen, view]);

  // Esc — выйти из комнаты. Не перехватываем ввод в текстовых полях.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || screen !== 'room') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, leave]);

  const signal = describeSignal();

  return (
    <div className="flex min-h-full flex-col">
      {screen === 'home' ? (
        <Home
          name={name}
          onName={setName}
          netKind={netKind}
          onNetKind={changeNet}
          signal={signal}
          soundOn={soundOn}
          onSound={toggleSound}
          onCreate={createRoom}
          onJoin={joinRoom}
          onQuick={quickGame}
        />
      ) : (
        <Room
          session={session}
          lobby={lobby}
          view={view}
          chat={chat}
          soundOn={soundOn}
          onSound={toggleSound}
          onLeave={leave}
        />
      )}

      {/* Тосты: всегда поверх, не перекрывают содержимое надолго */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-panel backdrop-blur fade-up',
              t.tone === 'err'
                ? 'border-red-500/40 bg-red-950/80 text-red-100'
                : t.tone === 'ok'
                  ? 'border-gold-400/40 bg-felt-600/90 text-gold-soft'
                  : 'border-[color:var(--line)] bg-felt-700/90 text-[#f2ede2]',
            ].join(' ')}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
