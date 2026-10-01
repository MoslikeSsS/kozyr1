/**
 * Совместимый слой над транспортами.
 *
 * host.ts написан под два конкретных класса — HostNet и GuestNet. Здесь они
 * собраны поверх нового транспортного слоя, чтобы игровой движок остался
 * нетронутым: он работает и уже проверен, ломать его незачем.
 */
import type { Card, Msg } from './types';
import { guestNet, hostNet, preferredKind, setPreferredKind, type ConnId, type NetKind } from '../net';
import { randomCode, normalizeCode, isValidCode } from './randomCode';

export { randomCode, normalizeCode, isValidCode };
export { describeSignal, preferredKind, setPreferredKind } from '../net';
export type { NetKind };

/** Транспорт выбирается один раз на сессию: хост и гость обязаны совпадать. */
let activeKind: NetKind = preferredKind();

export function setNetKind(kind: NetKind) {
  activeKind = kind;
  setPreferredKind(kind);
}

export function getNetKind(): NetKind {
  return activeKind;
}

/* ------------------------------------------------------------------ хост */

export class HostNet {
  private h: ReturnType<typeof hostNet>;

  constructor(
    public code: string,
    opts: {
      onReady: (code: string) => void;
      onJoin: (connId: string) => void;
      onData: (connId: string, msg: Msg) => void;
      onLeave: (connId: string) => void;
      onError: (m: string) => void;
    },
  ) {
    this.h = hostNet(activeKind, code, opts);
  }

  send(connId: ConnId, msg: Msg) {
    this.h.send(connId, msg);
  }

  broadcast(msg: Msg) {
    this.h.broadcast(msg);
  }

  kick(connId: ConnId) {
    this.h.kick(connId);
  }

  close() {
    this.h.close();
  }
}

/* ----------------------------------------------------------------- гость */

export class GuestNet {
  private h: ReturnType<typeof guestNet>;
  private sentHello = false;

  constructor(
    code: string,
    private name: string,
    opts: {
      onConnected: () => void;
      onData: (msg: Msg) => void;
      onClose: (kicked: boolean) => void;
      onError: (m: string) => void;
    },
  ) {
    this.h = guestNet(activeKind, code, name, {
      onOpen: () => {
        this.sentHello = true;
        opts.onConnected();
        // Игровой протокол начинается только после готовности транспорта.
        this.h.send({ t: 'hello', name });
      },
      onData: (msg) => {
        if (msg.t === 'kicked') {
          opts.onClose(true);
          return;
        }
        opts.onData(msg);
      },
      onClose: (reason) => opts.onClose(reason.includes('исключил')),
      onError: (m) => opts.onError(m),
    });
  }

  send(msg: Msg) {
    // Хост подставляет отправителя сам, но пустое имя ломает чат —
    // подставляем на своей стороне, чтобы в ленте был виден автор.
    const out: Msg = msg.t === 'chat' && !msg.from ? { ...msg, from: this.name } : msg;
    this.h.send(out);
  }

  /** Отправлено ли приветствие — используется для раннего таймаута. */
  get ready(): boolean {
    return this.sentHello;
  }

  close() {
    this.h.close();
  }
}

export type { Card };
