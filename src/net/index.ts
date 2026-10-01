/**
 * Выбор транспорта. По умолчанию — «вкладки одного браузера»: он работает
 * всегда, без сервера и без интернета. WebRTC включается явно, когда
 * нужен настоящий мультиплеер между устройствами.
 */
import { guestNetLocal, hostNetLocal } from './local';
import { guestNetRtc, hostNetRtc } from './webrtc';
import type { GuestNetHandle, GuestNetOpts, HostNetHandle, HostNetOpts, NetKind } from './types';

export * from './types';
export { describeSignal } from './webrtc';

const KEY = 'kozyr:net';

export function preferredKind(): NetKind {
  return localStorage.getItem(KEY) === 'webrtc' ? 'webrtc' : 'local';
}

export function setPreferredKind(kind: NetKind) {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    /* приватный режим — просто не запомним */
  }
}

export function hostNet(kind: NetKind, code: string, opts: HostNetOpts): HostNetHandle {
  return kind === 'webrtc' ? hostNetRtc(code, opts) : hostNetLocal(code, opts);
}

export function guestNet(
  kind: NetKind,
  code: string,
  name: string,
  opts: GuestNetOpts,
): GuestNetHandle {
  return kind === 'webrtc' ? guestNetRtc(code, name, opts) : guestNetLocal(code, name, opts);
}
