import type { Suit } from '../lib/types';

const SUIT_PATHS: Record<Suit, string> = {
  0: 'M12 2C8.2 7.6 3 10.2 3 14.4 3 17 5 19 7.6 19c1.6 0 2.9-.8 3.7-2-.4 2.4-1.5 4-3.1 5h7.6c-1.6-1-2.7-2.6-3.1-5 .8 1.2 2.1 2 3.7 2C19 19 21 17 21 14.4 21 10.2 15.8 7.6 12 2Z',
  1: 'M12 21.3C7.2 17 2 13.1 2 8.7 2 5.6 4.5 3.2 7.5 3.2c1.8 0 3.4.9 4.5 2.6 1.1-1.7 2.7-2.6 4.5-2.6 3 0 5.5 2.4 5.5 5.5 0 4.4-5.2 8.3-10 12.6Z',
  2: 'M12 2 19.2 12 12 22 4.8 12 12 2Z',
  3: 'M12 2a4 4 0 0 0-3.6 5.8A4.2 4.2 0 1 0 11 14.9c-.4 2.7-1.5 4.8-3.4 6.1h8.8c-1.9-1.3-3-3.4-3.4-6.1a4.2 4.2 0 1 0 2.6-7.1A4 4 0 0 0 12 2Z',
};

export function SuitIcon({ s, className = '' }: { s: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={SUIT_PATHS[s]} />
    </svg>
  );
}

function I({ d, className = '', filled = false }: { d: string; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const IconCopy = ({ className }: { className?: string }) => (
  <I className={className} d="M8 8h12v12H8zM4 16V4h12" />
);
export const IconX = ({ className }: { className?: string }) => (
  <I className={className} d="M5 5l14 14M19 5L5 19" />
);
export const IconPlus = ({ className }: { className?: string }) => (
  <I className={className} d="M12 4v16M4 12h16" />
);
export const IconSend = ({ className }: { className?: string }) => (
  <I className={className} d="M3 11.5 21 3l-6.5 18-3-7.5L3 11.5Z" />
);
export const IconGear = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
  </svg>
);
export const IconUsers = ({ className }: { className?: string }) => (
  <I className={className} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
);
export const IconCrown = ({ className }: { className?: string }) => (
  <I filled className={className} d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.6 10.5H4.6L3 8Z" />
);
export const IconCards = ({ className }: { className?: string }) => (
  <I className={className} d="M7 5h11v14H7zM7 5 4 6.5v13L7 21M18 8.5h2V21l-9 1.5" />
);
export const IconBolt = ({ className }: { className?: string }) => (
  <I filled className={className} d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
);
export const IconFlag = ({ className }: { className?: string }) => (
  <I className={className} d="M5 21V4s1.5-1.5 5-1.5S15 4 18.5 4c0 0 .5 0 .5.5V13c0 .5-.5.5-.5.5-3.5 0-5-1.5-8.5-1.5-2.3 0-3.7.7-4.5 1.2" />
);
export const IconRefresh = ({ className }: { className?: string }) => (
  <I className={className} d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5" />
);
export const IconSoundOn = ({ className }: { className?: string }) => (
  <I className={className} d="M4 9v6h4l6 5V4L8 9H4ZM17.5 8.5a5 5 0 0 1 0 7M20 6a9 9 0 0 1 0 12" />
);
export const IconSoundOff = ({ className }: { className?: string }) => (
  <I className={className} d="M4 9v6h4l6 5V4L8 9H4ZM17 9l5 6M22 9l-5 6" />
);
export const IconBot = ({ className }: { className?: string }) => (
  <I className={className} d="M12 3v3M8 6h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3ZM9 12h.01M15 12h.01M2 11v4M22 11v4" />
);
export const IconTimer = ({ className }: { className?: string }) => (
  <I className={className} d="M12 7v5l3 3M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 2h6" />
);
