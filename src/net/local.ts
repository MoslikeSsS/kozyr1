/**
 * Транспорт «вкладки одного браузера» — на BroadcastChannel.
 *
 * Нужен всегда: он работает без сервера и без интернета, поэтому игра запускается
 * на любой машине, в любом браузере, без настройки. Внутри одного браузера
 * открывается столько вкладок, сколько нужно, и они образуют полноценный стол.
 *
 * BroadcastChannel молчит, когда вкладка закрывается, поэтому присутствие
 * держится на heartbeat: каждый участник стучится в общий канал, хост видит
 * дату последнего контакта и объявляет ушедших по таймауту.
 */
import type { Msg } from '../lib/types';
import type { ConnId, GuestNetHandle, GuestNetOpts, HostNetHandle, HostNetOpts } from './types';

type Envelope = {
  from: string;
  to: string | '*';
  kind: 'msg' | 'hello' | 'ack' | 'ping' | 'bye';
  msg?: Msg;
  name?: string;
};

const CHANNEL = (code: string) => `kozyr:${code}`;
const BEAT_MS = 2000;
const STALE_MS = 8000;

const rid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------------ хост */

export function hostNetLocal(code: string, opts: HostNetOpts): HostNetHandle {
  const me = `h${rid()}`;
  const ch = new BroadcastChannel(CHANNEL(code));
  const peers = new Map<ConnId, number>();
  let closed = false;

  const post = (to: string | '*', kind: Envelope['kind'], msg?: Msg, name?: string) => {
    if (closed) return;
    try {
      ch.postMessage({ from: me, to, kind, msg, name } satisfies Envelope);
    } catch {
      /* канал закрыт — ничего не делаем */
    }
  };

  // Извещение об уходе уходит даже после того, как закрыт флаг: флаг
  // запрещает обычную отправку, а это сообщение как раз нужно отдать.
  const bye = () => {
    try {
      ch.postMessage({ from: me, to: '*', kind: 'bye' } satisfies Envelope);
    } catch {
      /* канал уже закрыт */
    }
  };

  // Гость заявился. Запомнили и подтвердили: гость после подтверждения сам
  // пришлёт {t:'hello'} — это игровой протокол, transports его не трогает.
  const accept = (from: ConnId) => {
    if (peers.has(from)) return;
    peers.set(from, Date.now());
    post(from, 'ack');
    opts.onJoin(from);
  };

  ch.onmessage = (e: MessageEvent<Envelope>) => {
    const env = e.data;
    if (!env || env.from === me) return;

    if (env.kind === 'bye') {
      if (peers.delete(env.from)) opts.onLeave(env.from);
      return;
    }

    if (env.kind === 'ping' || env.kind === 'ack') {
      if (env.to === me || env.to === '*') peers.set(env.from, Date.now());
      return;
    }

    if (env.kind === 'hello') {
      accept(env.from);
      return;
    }

    if (env.kind === 'msg' && env.msg) {
      if (!peers.has(env.from)) accept(env.from);
      peers.set(env.from, Date.now());
      opts.onData(env.from, env.msg);
    }
  };

  const beat = window.setInterval(() => {
    post('*', 'ping');
    const now = Date.now();
    for (const [id, last] of peers) {
      if (now - last > STALE_MS) {
        peers.delete(id);
        opts.onLeave(id);
      }
    }
  }, BEAT_MS);
  window.addEventListener('beforeunload', bye);
  window.addEventListener('pagehide', bye);

  opts.onReady(code);

  return {
    kind: 'local',
    code,
    send: (connId, msg) => post(connId, 'msg', msg),
    broadcast: (msg) => post('*', 'msg', msg),
    kick: (connId) => {
      post(connId, 'msg', { t: 'kicked' });
      // Даём сообщению уйти в канал до того, как гостя вычеркнем.
      window.setTimeout(() => {
        if (peers.delete(connId)) opts.onLeave(connId);
      }, 120);
    },
    close: () => {
      if (closed) return;
      closed = true;
      bye();
      window.clearInterval(beat);
      window.removeEventListener('beforeunload', bye);
      window.removeEventListener('pagehide', bye);
      // Канал закрываем не сразу: доставка postMessage асинхронна, и если
      // закрыть его в ту же миллисекунду, извещение об уходе пропадёт.
      // Тогда хост узнает о disconnection только по таймауту — через 8 секунд,
      // и всё это время у пустого места будет гореть «в сети».
      window.setTimeout(() => ch.close(), 60);
    },
  };
}

/* ----------------------------------------------------------------- гость */

export function guestNetLocal(code: string, _name: string, opts: GuestNetOpts): GuestNetHandle {
  const me = `g${rid()}`;
  const ch = new BroadcastChannel(CHANNEL(code));
  let opened = false;
  let closed = false;
  let lastHostSeen = Date.now();

  const post = (to: string | '*', kind: Envelope['kind'], msg?: Msg, name?: string) => {
    if (closed) return;
    try {
      ch.postMessage({ from: me, to, kind, msg, name } satisfies Envelope);
    } catch {
      /* канал закрыт */
    }
  };

  // Как и у хоста: извещение об уходе отправляется в обход флага закрытия.
  const bye = () => {
    try {
      ch.postMessage({ from: me, to: '*', kind: 'bye' } satisfies Envelope);
    } catch {
      /* канал уже закрыт */
    }
  };

  ch.onmessage = (e: MessageEvent<Envelope>) => {
    const env = e.data;
    if (!env || env.from === me) return;

    if (env.kind === 'ack' && (env.to === me || env.to === '*')) {
      lastHostSeen = Date.now();
      if (!opened) {
        opened = true;
        opts.onOpen();
      }
      return;
    }

    if (env.kind === 'ping') {
      lastHostSeen = Date.now();
      return;
    }

    if (env.kind === 'msg' && env.msg) {
      if (env.msg.t === 'kicked') {
        opts.onClose('Вас исключил хост');
        return;
      }
      opts.onData(env.msg);
    }
  };

  // Просимся сразу, а не по таймеру: ждать до двух секунд молчания перед
  // первой попыткой выглядит для игрока как «ничего не происходит».
  post('*', 'hello', undefined, _name);

  // Держим присутствие, пока хост не ответил.
  const beat = window.setInterval(() => {
    if (!opened) post('*', 'hello', undefined, _name);
    post('*', 'ping');
    if (opened && Date.now() - lastHostSeen > STALE_MS * 2) {
      opts.onClose('Хост перестал отвечать');
    }
  }, BEAT_MS);
  window.addEventListener('beforeunload', bye);
  window.addEventListener('pagehide', bye);

  return {
    kind: 'local',
    send: (msg) => post('*', 'msg', msg),
    close: () => {
      if (closed) return;
      closed = true;
      bye();
      window.clearInterval(beat);
      window.removeEventListener('beforeunload', bye);
      window.removeEventListener('pagehide', bye);
      // Закрываем канал с задержкой, иначе извещение об уходе не успеет
      // дойти и хост узнает о disconnection только по таймауту.
      window.setTimeout(() => ch.close(), 60);
    },
  };
}
