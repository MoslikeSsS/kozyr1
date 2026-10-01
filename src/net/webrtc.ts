/**
 * Транспорт WebRTC через PeerJS — связь между разными устройствами и браузерами.
 *
 * Само WebRTC не соединяет браузеры напрямую: сначала нужно «знакомство»,
 * для чего нужен сервер сигнализации. Он выбирается так:
 *
 *   1. Переменные окружения VITE_SIGNAL_HOST / _PORT / _PATH — если заданы.
 *   2. Порт 9000 или 8080 — считаем, что запущен наш локальный сервер.
 *   3. Иначе — публичный сервер PeerJS. Работает сразу, но это чужой сервер:
 *      через него проходят коды комнат, и он может быть недоступен.
 *
 * Для игры по интернету без своего сервера держится только третий пункт.
 */
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { Msg } from '../lib/types';
import type { ConnId, GuestNetHandle, GuestNetOpts, HostNetHandle, HostNetOpts } from './types';

/** Префикс peer-id комнаты, чтобы чужие комнаты не пересекались. */
const PREFIX = 'kozyr-';

export const SIGNAL_PEER = PREFIX;

type SignalOpts = { host?: string; port?: number; path?: string };

/** Показывает, какой сервер сигнализации будет использован — для интерфейса. */
export function describeSignal(): { label: string; own: boolean } {
  const env = import.meta.env;
  const custom: SignalOpts = {
    host: env.VITE_SIGNAL_HOST || undefined,
    port: env.VITE_SIGNAL_PORT ? Number(env.VITE_SIGNAL_PORT) : undefined,
    path: env.VITE_SIGNAL_PATH || undefined,
  };
  if (custom.host) return { label: `${custom.host}${custom.port ? ':' + custom.port : ''}`, own: true };

  const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
  if (port === 9000 || port === 8080) {
    return { label: `${window.location.hostname}:${port}`, own: true };
  }
  return { label: 'публичный сервер PeerJS', own: false };
}

function signalOptions(): PeerOptions {
  const env = import.meta.env;
  const custom = {
    host: env.VITE_SIGNAL_HOST || undefined,
    port: env.VITE_SIGNAL_PORT ? Number(env.VITE_SIGNAL_PORT) : undefined,
    path: env.VITE_SIGNAL_PATH || undefined,
  };
  if (custom.host) return custom;

  const port = Number(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80);
  // Локальный сервер: игра и сигналинг на одном порту.
  if (port === 9000 || port === 8080) {
    return { host: window.location.hostname, port, path: '/peerjs' };
  }
  // Публичный облачный сервер PeerJS.
  return { host: '0.peerjs.com', port: 443, path: '/', secure: true };
}

/* ------------------------------------------------------------------ хост */

export function hostNetRtc(code: string, opts: HostNetOpts): HostNetHandle {
  const peers = new Map<ConnId, DataConnection>();
  let closed = false;
  let settled = false;

  const peer = new Peer(PREFIX + code, signalOptions());

  // Хост обязан дождаться регистрации peer-id: раньше этого момента
  // гости не смогут к нему обратиться, а onReady обещает «комната готова».
  const readyTimer = window.setTimeout(() => {
    if (settled || closed) return;
    settled = true;
    opts.onError('Не удалось поднять комнату: сервер сигнализации не отвечает');
  }, 12000);

  peer.on('open', () => {
    if (settled || closed) return;
    settled = true;
    window.clearTimeout(readyTimer);
    opts.onReady(code);
  });

  peer.on('connection', (conn) => {
    const id = conn.peer;
    conn.on('open', () => {
      if (closed) return;
      peers.set(id, conn);
      opts.onJoin(id);
    });
    conn.on('data', (raw) => {
      // Повреждённый кадр не должен ронять стол: молча пропускаем.
      const msg = decode(raw);
      if (msg) opts.onData(id, msg);
    });
    conn.on('close', () => {
      if (peers.delete(id)) opts.onLeave(id);
    });
    conn.on('error', () => {
      if (peers.delete(id)) opts.onLeave(id);
    });
  });

  peer.on('error', (err) => {
    const type = err.type;
    if (type === 'unavailable-id') {
      opts.onError('Такая комната уже открыта в другом окне. Попробуйте другой код.');
    } else if (type === 'peer-unavailable') {
      opts.onError('Хост не отвечает: возможно, он уже закрыл комнату.');
    } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      opts.onError('Нет связи с сервером сигнализации. Проверьте интернет.');
    } else if (type === 'browser-incompatible') {
      opts.onError('Браузер не поддерживает WebRTC.');
    } else {
      opts.onError(err.message || 'Ошибка соединения');
    }
  });

  return {
    kind: 'webrtc',
    code,
    send: (connId, msg) => {
      const conn = peers.get(connId);
      if (conn?.open) conn.send(msg);
    },
    broadcast: (msg) => {
      for (const conn of peers.values()) if (conn.open) conn.send(msg);
    },
    kick: (connId) => {
      const conn = peers.get(connId);
      if (!conn) return;
      try {
        if (conn.open) conn.send({ t: 'kicked' } satisfies Msg);
      } catch {
        /* соединение уже мертво */
      }
      window.setTimeout(() => conn.close(), 150);
      peers.delete(connId);
    },
    close: () => {
      if (closed) return;
      closed = true;
      window.clearTimeout(readyTimer);
      for (const conn of peers.values()) {
        try {
          conn.close();
        } catch {
          /* нечего закрывать */
        }
      }
      peers.clear();
      peer.destroy();
    },
  };
}

/* ----------------------------------------------------------------- гость */

export function guestNetRtc(code: string, _name: string, opts: GuestNetOpts): GuestNetHandle {
  let conn: DataConnection | null = null;
  let closed = false;
  const wanted = PREFIX + code;

  const peer = new Peer(signalOptions());

  peer.on('open', () => {
    if (closed) return;
    conn = peer.connect(wanted, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      if (!closed) opts.onOpen();
    });
    conn.on('data', (raw) => {
      const msg = decode(raw);
      if (msg?.t === 'kicked') {
        opts.onClose('Вас исключил хост');
        return;
      }
      if (msg) opts.onData(msg);
    });
    conn.on('close', () => {
      if (!closed) opts.onClose('Соединение с хостом прервано');
    });
    conn.on('error', () => {
      if (!closed) opts.onClose('Ошибка соединения с хостом');
    });
  });

  peer.on('error', (err) => {
    const type = err.type;
    if (type === 'peer-unavailable') {
      opts.onError(`Комната ${code} не найдена. Проверьте код — три цифры.`);
    } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      opts.onError('Нет связи с сервером сигнализации. Проверьте интернет.');
    } else if (type === 'browser-incompatible') {
      opts.onError('Браузер не поддерживает WebRTC.');
    } else {
      opts.onError(err.message || 'Не удалось подключиться');
    }
  });

  return {
    kind: 'webrtc',
    send: (msg) => {
      if (conn?.open) conn.send(msg);
    },
    close: () => {
      if (closed) return;
      closed = true;
      try {
        conn?.close();
      } catch {
        /* уже закрыт */
      }
      peer.destroy();
    },
  };
}

/** Принимаем и «чистый» Msg, и строку — старые клиенты могли слать так. */
function decode(raw: unknown): Msg | null {
  if (!raw) return null;
  if (typeof raw === 'object' && 't' in (raw as Record<string, unknown>)) return raw as Msg;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p.t === 'string' ? (p as Msg) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Имя гостя пока не передаётся по сети — оно приходит в {t:'hello'} от шима. */
export const guestName = (n: string) => n;
