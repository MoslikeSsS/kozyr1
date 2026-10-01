import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LobbyInfo, SeatMeta } from '../lib/types';
import { IconBot, IconBolt, IconCards, IconCopy, IconCrown, IconUsers } from '../components/Icons';

type Props = {
  lobby: LobbyInfo;
  isHost: boolean;
  onStart: () => void;
  onAddBot: () => void;
};

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-400/50';

function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}#${code}`;
}

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

function rulesFor(lobby: LobbyInfo): string[] {
  if (lobby.game === 'poker') {
    return [
      'Сильнейшая комбинация забирает банк: сет, стрит, флеш, фулл-хаус, каре, старший кикер.',
      `Малый и большой блайнды — ${lobby.sb} и ${lobby.bb}, ставятся автоматически каждую раздачу.`,
      'На префлопе можно рейзить, после флопа — чековать и коллить. Держите фишки, а не карты.',
      'Кто остался без фишек — выбывает. Последний игрок с фишками выигрывает матч.',
    ];
  }
  if (lobby.mode === 'transfer') {
    return [
      'Бьём карту старшей картой, козырь бьёт всё.',
      'Взяли взятку — можете перевести её другому игроку: он защищается за вас.',
      'Отбиться обязан любой, кто может; не можете — берите и переводите.',
      'Кто проиграл, забирает всю колоду. Колода кончилась — проиграл тот, у кого больше карт.',
    ];
  }
  return [
    'Бьём карту старшей картой, козырь бьёт всё.',
    'Не можете побить — берите взятку и отдавайте карты.',
    'Подкидывать можно, только пока не брали взяток; отбиться обязан любой.',
    'Кто проиграл, забирает всю колоду. Колода кончилась — проиграл тот, у кого больше карт.',
  ];
}

function Tag({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'plain' }) {
  return (
    <span
      className={
        tone === 'gold'
          ? 'inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-sm font-semibold text-gold-300'
          : 'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white/[.04] px-3 py-1 text-sm font-semibold text-[color:var(--text)]'
      }
    >
      {children}
    </span>
  );
}

function SeatCard({ seat, index }: { seat: SeatMeta | null; index: number }) {
  if (!seat) {
    return (
      <li className="flex min-h-[76px] items-center gap-3 rounded-xl border-2 border-dashed border-[color:var(--line)] p-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-[color:var(--line)] text-sm text-[color:var(--muted)]"
          aria-hidden
        >
          {index + 1}
        </span>
        <span className="text-sm text-[color:var(--muted)]">свободно</span>
      </li>
    );
  }
  return (
    <li className="flex min-h-[76px] items-center gap-3 rounded-xl border border-[color:var(--line)] bg-white/[.04] p-3">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold-400/15 text-base font-bold text-gold-300"
        aria-hidden
      >
        {seat.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-[color:var(--text)]">{seat.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {seat.isHost && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-gold-300">
              <IconCrown className="h-3.5 w-3.5" />
              хост
            </span>
          )}
          {seat.bot && (
            <span className="inline-flex items-center gap-1 text-sm text-[color:var(--muted)]">
              <IconBot className="h-3.5 w-3.5" />
              бот
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
            <span
              className={
                seat.connected ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-[color:var(--muted)]'
              }
              aria-hidden
            />
            {seat.connected ? 'в сети' : 'отключён'}
          </span>
        </div>
      </div>
    </li>
  );
}

export default function Lobby({ lobby, isHost, onStart, onAddBot }: Props) {
  const [link, setLink] = useState(() => inviteLink(lobby.code));
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setLink(inviteLink(lobby.code));
  }, [lobby.code]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const players = lobby.seats.length;
  const enough = players >= 2;

  const copy = async () => {
    const ok = await copyText(link);
    setCopyState(ok ? 'ok' : 'err');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <div className="fade-up mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 sm:p-4 lg:p-6">
      {/* ---------------- игроки ---------------- */}
      <section className="panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl text-gold-300 sm:text-2xl">Комната собрана</h1>
          <Tag tone="plain">
            {lobby.game === 'poker' ? <IconCards className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
            {lobby.game === 'poker'
              ? `Покер ${lobby.sb}/${lobby.bb}`
              : `Дурак · ${lobby.mode === 'transfer' ? 'переводной' : 'подкидной'}`}
          </Tag>
          <Tag>
            <IconUsers className="h-4 w-4" />
            {players} из {lobby.maxSeats}
          </Tag>
        </div>

        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: lobby.maxSeats }, (_, i) => (
            <SeatCard key={lobby.seats[i]?.id ?? `free-${i}`} seat={lobby.seats[i] ?? null} index={i} />
          ))}
        </ul>

        {!enough && (
          <p className="mt-4 rounded-xl border border-gold-400/25 bg-gold-400/[.07] px-4 py-3 text-[15px] leading-relaxed text-gold-300">
            Пока в комнате один игрок. Откройте игру в другой вкладке или на телефоне и войдите
            по коду из шапки — либо {isHost ? <>добавьте бота кнопкой ниже</> : <>попросите хоста добавить бота</>},
            чтобы начать без ожидания.
          </p>
        )}

        <div className="mt-4">
          {isHost ? (
            <button
              type="button"
              onClick={onStart}
              disabled={!enough}
              className={'btn-gold min-h-[44px] w-full cursor-pointer sm:w-auto sm:!px-8 ' + FOCUS}
            >
              <IconBolt className="h-4 w-4" />
              Начать игру
            </button>
          ) : (
            <p className="rounded-xl border border-[color:var(--line)] bg-white/[.03] px-4 py-3 text-[15px] text-[color:var(--text)]">
              Ждём, пока хост начнёт игру.
            </p>
          )}
          {isHost && !enough && (
            <button
              type="button"
              onClick={onAddBot}
              className={'btn-ghost mt-2 min-h-[44px] w-full cursor-pointer sm:mt-0 sm:ml-2 sm:w-auto ' + FOCUS}
            >
              <IconBot className="h-4 w-4" />
              Добавить бота
            </button>
          )}
        </div>
      </section>

      {/* ---------------- приглашение и правила ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-[.12em] text-gold-300/90">
            Ссылка для приглашения
          </h2>
          <div className="field">
            <label htmlFor="invite-link" className="!text-sm">
              Ссылка и код комнаты
            </label>
            <div className="flex gap-2">
              <input
                id="invite-link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate"
              />
              <button
                type="button"
                onClick={copy}
                className={'btn-gold min-h-[44px] shrink-0 cursor-pointer !px-4 ' + FOCUS}
              >
                <IconCopy className="h-4 w-4" />
                {copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Не вышло' : 'Копировать'}
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
            Отправьте ссылку другу — он войдёт в комнату по коду из ссылки. Код также написан
            крупно в шапке: его можно продиктовать.
          </p>
        </section>

        <section className="panel p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-[.12em] text-gold-300/90">
            Правила
          </h2>
          <ul className="space-y-2">
            {rulesFor(lobby).map((r) => (
              <li key={r} className="flex gap-2.5 text-[15px] leading-relaxed text-[color:var(--text)]">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
