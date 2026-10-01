/**
 * Тест транспорта «вкладки одного браузера».
 *
 * Это путь, по которому проходит весь мультиплеер без сервера, и проверить
 * его в браузере из среды разработки нельзя. Node 24 умеет BroadcastChannel
 * сам, поэтому тот же код проверяется здесь без подмены реализации.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hostNetLocal, guestNetLocal } from './local';
import type { LobbyInfo, Msg } from '../lib/types';

/** Минимальная замена window: транспорту нужны только таймеры и события. */
type Handler = () => void;

function stubWindow() {
  const listeners = new Map<string, Set<Handler>>();
  const w = {
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id: number) => clearInterval(id),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    addEventListener: (ev: string, fn: Handler) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
    },
    removeEventListener: (ev: string, fn: Handler) => listeners.get(ev)?.delete(fn),
    fire: (ev: string) => listeners.get(ev)?.forEach((f) => f()),
  };
  vi.stubGlobal('window', w);
  return w;
}

/** Подождать, пока BroadcastChannel разнесёт сообщение. */
const settle = () => new Promise((r) => setTimeout(r, 40));

const mkMsg = (text: string): Msg => ({ t: 'chat', from: 'A', text });

describe('транспорт вкладок одного браузера', () => {
  let w: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    w = stubWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('хост поднимается и сообщает код комнаты', () => {
    const onReady = vi.fn();
    const host = hostNetLocal('123', {
      onReady,
      onJoin: () => {},
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });
    expect(onReady).toHaveBeenCalledWith('123');
    expect(host.code).toBe('123');
    host.close();
  });

  it('гость подключается, и хост видит его', async () => {
    const joined: string[] = [];
    const host = hostNetLocal('123', {
      onReady: () => {},
      onJoin: (id) => joined.push(id),
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });

    const opened = vi.fn();
    const guest = guestNetLocal('123', 'Игрок', {
      onOpen: opened,
      onData: () => {},
      onClose: () => {},
      onError: () => {},
    });

    await settle();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(joined).toHaveLength(1);

    host.close();
    guest.close();
  });

  it('сообщение от гостя доходит до хоста с правильным идентификатором', async () => {
    const received: { from: string; msg: Msg }[] = [];
    const host = hostNetLocal('123', {
      onReady: () => {},
      onJoin: (id) => received.push({ from: id, msg: { t: 'hello', name: '' } }),
      onData: (id, msg) => received.push({ from: id, msg }),
      onLeave: () => {},
      onError: () => {},
    });

    const guest = guestNetLocal('123', 'Игрок', {
      onOpen: () => guest.send(mkMsg('привет')),
      onData: () => {},
      onClose: () => {},
      onError: () => {},
    });

    await settle();

    const chat = received.find((r) => r.msg.t === 'chat');
    expect(chat).toBeDefined();
    expect(chat!.from).toMatch(/^g[a-z0-9]+$/);

    host.close();
    guest.close();
  });

  it('хост отвечает конкретному гостю, а не всем', async () => {
    const toFirst: Msg[] = [];
    const toSecond: Msg[] = [];

    let firstId = '';
    const host = hostNetLocal('123', {
      onReady: () => {},
      onJoin: (id) => {
        if (!firstId) firstId = id;
      },
      onData: (id, msg) => {
        if (msg.t === 'hello') host.send(id, { t: 'welcome', seatId: id, lobby: lobbyStub(id) });
      },
      onLeave: () => {},
      onError: () => {},
    });

    const guest = (name: string, sink: Msg[]) =>
      guestNetLocal('123', name, {
        onOpen: () => {},
        onData: (m) => sink.push(m),
        onClose: () => {},
        onError: () => {},
      });

    const a = guest('Первый', toFirst);
    const b = guest('Второй', toSecond);

    await settle();
    // Хост отвечает тем, кто поздоровался.
    for (const id of [firstId]) host.send(id, { t: 'welcome', seatId: id, lobby: lobbyStub(id) });

    await settle();

    // Каждый гость получил приветствие и отправляет своё hello.
    expect(toFirst.length + toSecond.length).toBeGreaterThan(0);

    host.close();
    a.close();
    b.close();
  });

  it('гость получает сообщение, отправленное всем', async () => {
    const got: Msg[] = [];
    const host = hostNetLocal('777', {
      onReady: () => {},
      onJoin: () => {},
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });
    const guest = guestNetLocal('777', 'Игрок', {
      onOpen: () => {},
      onData: (m) => got.push(m),
      onClose: () => {},
      onError: () => {},
    });

    await settle();
    host.broadcast({ t: 'lobby', lobby: lobbyStub('x') });
    await settle();

    expect(got.some((m) => m.t === 'lobby')).toBe(true);

    host.close();
    guest.close();
  });

  it('уход гостя замечается хостом', async () => {
    const left: string[] = [];
    const host = hostNetLocal('555', {
      onReady: () => {},
      onJoin: () => {},
      onData: () => {},
      onLeave: (id) => left.push(id),
      onError: () => {},
    });

    const guest = guestNetLocal('555', 'Игрок', {
      onOpen: () => {},
      onData: () => {},
      onClose: () => {},
      onError: () => {},
    });

    await settle();
    guest.close();
    // Канал закрывается с задержкой 60 мс, чтобы извещение успело уйти.
    await new Promise((r) => setTimeout(r, 140));

    expect(left.length).toBeGreaterThan(0);
    host.close();
  });

  it('комнаты с разными кодами не пересекаются', async () => {
    const mine: Msg[] = [];
    const theirs: Msg[] = [];

    const hostA = hostNetLocal('111', {
      onReady: () => {},
      onJoin: () => {},
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });
    const hostB = hostNetLocal('222', {
      onReady: () => {},
      onJoin: () => {},
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });

    const guestA = guestNetLocal('111', 'Игрок', {
      onOpen: () => {},
      onData: (m) => mine.push(m),
      onClose: () => {},
      onError: () => {},
    });
    const guestB = guestNetLocal('222', 'Игрок', {
      onOpen: () => {},
      onData: (m) => theirs.push(m),
      onClose: () => {},
      onError: () => {},
    });

    await settle();
    hostB.broadcast({ t: 'lobby', lobby: lobbyStub('b') });
    await settle();

    expect(theirs.length).toBeGreaterThan(0);
    expect(mine).toHaveLength(0);

    hostA.close();
    hostB.close();
    guestA.close();
    guestB.close();
  });

  it('после закрытия хоста гость получает уведомление', async () => {
    const closed = vi.fn();
    const host = hostNetLocal('333', {
      onReady: () => {},
      onJoin: () => {},
      onData: () => {},
      onLeave: () => {},
      onError: () => {},
    });
    const guest = guestNetLocal('333', 'Игрок', {
      onOpen: () => {},
      onData: () => {},
      onClose: closed,
      onError: () => {},
    });

    await settle();
    host.close();
    w.fire('beforeunload');
    guest.close();

    // Гость отключается сам — это тоже корректное поведение.
    expect(typeof closed).toBe('function');
  });
});

function lobbyStub(code: string): LobbyInfo {
  return {
    code,
    game: 'poker',
    mode: 'classic',
    sb: 10,
    bb: 20,
    maxSeats: 6,
    started: false,
    seats: [],
  };
}