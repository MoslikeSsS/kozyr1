import type { Msg } from '../lib/types';

/** Идентификатор соединения. Для гостя он же является id места за столом. */
export type ConnId = string;

/**
 * Способ связи.
 * local  — вкладки одного браузера через BroadcastChannel. Сервер не нужен.
 * webrtc — настоящий WebRTC между браузерами, для знакомства нужен сервер сигнализации.
 */
export type NetKind = 'local' | 'webrtc';

export type NetStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'closed';

export interface HostNetOpts {
  /** Хост поднялся и ждёт игроков. */
  onReady: (code: string) => void;
  /** Гость подключился к транспорту. Ещё не игрок — он пришлёт {t:'hello'} после. */
  onJoin: (connId: ConnId) => void;
  /** Игровое сообщение от конкретного гостя. */
  onData: (connId: ConnId, msg: Msg) => void;
  /** Гость отключился. */
  onLeave: (connId: ConnId) => void;
  onError: (m: string) => void;
}

export interface HostNetHandle {
  readonly kind: NetKind;
  readonly code: string;
  /** Отправить одному гостю. */
  send(connId: ConnId, msg: Msg): void;
  /** Отправить всем, включая будущих гостей? Нет — только тем, кто уже подключён. */
  broadcast(msg: Msg): void;
  kick(connId: ConnId): void;
  close(): void;
}

export interface GuestNetOpts {
  /** Соединение с хостом установлено, можно слать {t:'hello'}. */
  onOpen: () => void;
  onData: (msg: Msg) => void;
  /** Хост отключился или выбил. reason — текст для показа игроку. */
  onClose: (reason: string) => void;
  onError: (m: string) => void;
}

export interface GuestNetHandle {
  readonly kind: NetKind;
  send(msg: Msg): void;
  close(): void;
}
