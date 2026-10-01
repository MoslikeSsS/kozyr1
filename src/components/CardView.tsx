import type { CSSProperties, ReactNode } from 'react';
import type { Card } from '../lib/types';
import { RANK_LABEL, isRed } from '../lib/cards';
import { SuitIcon } from './Icons';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<CardSize, { w: string; r: string; corner: string; center: string }> = {
  xs: { w: 'w-8 h-[46px]', r: 'rounded-[5px]', corner: 'text-[9px]', center: 'w-3.5 h-3.5' },
  sm: { w: 'w-10 h-[58px]', r: 'rounded-md', corner: 'text-[11px]', center: 'w-4 h-4' },
  md: { w: 'w-13 h-[76px]', r: 'rounded-lg', corner: 'text-[13px]', center: 'w-6 h-6' },
  lg: { w: 'w-16 h-[92px]', r: 'rounded-lg', corner: 'text-[15px]', center: 'w-7 h-7' },
  xl: { w: 'w-20 h-[116px]', r: 'rounded-xl', corner: 'text-lg', center: 'w-9 h-9' },
};

export function CardFace({
  c, size = 'md', className = '', style, onClick, glow,
}: {
  c: Card;
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  glow?: 'red' | 'yellow' | 'green' | 'gold' | null;
}) {
  const sz = SIZE[size];
  const red = isRed(c.s);
  const glowCls =
    glow === 'red' ? 'glow-red' : glow === 'yellow' ? 'glow-yellow' : glow === 'green' ? 'glow-green' : glow === 'gold' ? 'glow-gold' : '';
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      style={style}
      className={[
        'relative shrink-0 no-select bg-cardface border border-black/25 shadow-[0_4px_14px_rgba(0,0,0,0.45)]',
        sz.w, sz.r, red ? 'text-deepred' : 'text-cardink',
        clickable ? 'cursor-pointer transition-transform duration-150 hover:-translate-y-2 hover:z-20 active:translate-y-0' : '',
        glowCls, className,
      ].join(' ')}
    >
      <div className={`absolute top-0.5 left-1 flex flex-col items-center leading-none font-bold ${sz.corner}`}>
        <span>{RANK_LABEL[c.r]}</span>
        <SuitIcon s={c.s} className="w-2.5 h-2.5 mt-[1px]" />
      </div>
      <div className={`absolute bottom-0.5 right-1 flex flex-col items-center leading-none font-bold rotate-180 ${sz.corner}`}>
        <span>{RANK_LABEL[c.r]}</span>
        <SuitIcon s={c.s} className="w-2.5 h-2.5 mt-[1px]" />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        {c.r >= 11 ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`font-display font-bold leading-none ${size === 'xs' || size === 'sm' ? 'text-sm' : 'text-xl'}`}>
              {RANK_LABEL[c.r]}
            </span>
            <SuitIcon s={c.s} className={sz.center} />
          </div>
        ) : (
          <SuitIcon s={c.s} className={`${sz.center} ${size === 'xl' ? 'w-11 h-11' : ''}`} />
        )}
      </div>
    </div>
  );
}

export function CardBack({ size = 'md', className = '', style }: { size?: CardSize; className?: string; style?: CSSProperties }) {
  const sz = SIZE[size];
  return (
    <div
      style={style}
      className={`shrink-0 no-select rounded-[8px] bg-cardface border border-black/25 shadow-[0_4px_14px_rgba(0,0,0,0.45)] p-[3px] ${sz.w} ${className}`}
    >
      <div className="card-back-pattern w-full h-full rounded-[5px] border border-gold-400/50" />
    </div>
  );
}

export function Pile({ count, label, rotate = false }: { count: number; label: ReactNode; rotate?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-14 h-[80px]">
        {count > 0 ? (
          <>
            {count > 2 && <CardBack size="sm" className="absolute inset-x-0 top-1 rotate-[5deg]" />}
            {count > 1 && <CardBack size="sm" className="absolute inset-x-0 top-0.5 rotate-[-4deg]" />}
            <CardBack size="sm" className={`absolute inset-x-0 top-0 ${rotate ? 'rotate-90 scale-110' : ''}`} />
          </>
        ) : (
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-cream/15" />
        )}
      </div>
      <div className="text-[11px] text-cream/60 font-medium">{label}</div>
    </div>
  );
}
