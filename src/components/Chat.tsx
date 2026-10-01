import { useEffect, useRef, useState } from 'react';
import type { ChatLine } from '../lib/types';
import { IconCrown, IconSend } from './Icons';

type Props = {
  lines: ChatLine[];
  onSend: (text: string) => void;
  isHost: boolean;
};

const MAX_LEN = 140;

/* Поле ввода повторяет .field input из index.css, но без uppercase-подписи,
   поэтому класс собираем здесь — только из Tailwind-классов и переменных темы. */
const INPUT =
  'w-full min-w-0 rounded-lg border border-[color:var(--line)] bg-black/30 px-4 py-3 ' +
  'text-base text-[color:var(--text)] transition placeholder:text-[color:var(--muted)] ' +
  'focus:border-gold-400/70 focus-visible:ring-2 focus-visible:ring-gold-400/50';

const SEND_BTN = 'btn-gold min-h-[44px] min-w-[44px] cursor-pointer !px-3';

function Bubble({ line, grouped }: { line: ChatLine; grouped: boolean }) {
  if (line.mine) {
    return (
      <li className="flex justify-end">
        <div className="max-w-[86%]">
          {!grouped && (
            <p className="mb-0.5 pr-1 text-right text-sm text-gold-300/90">Вы</p>
          )}
          <p
            className="rounded-2xl rounded-br-md border border-gold-400/40 bg-gold-400/10 px-3.5 py-2
                       text-[15px] leading-relaxed text-gold-300"
          >
            {line.text}
          </p>
        </div>
      </li>
    );
  }
  return (
    <li className="flex justify-start">
      <div className="max-w-[86%]">
        {!grouped && (
          <p className="mb-0.5 pl-1 text-sm font-semibold text-[color:var(--muted)]">{line.from}</p>
        )}
        <p
          className="rounded-2xl rounded-bl-md border border-[color:var(--line)] bg-white/[.05] px-3.5 py-2
                     text-[15px] leading-relaxed text-[color:var(--text)]"
        >
          {line.text}
        </p>
      </div>
    </li>
  );
}

export function Chat({ lines, onSend, isHost }: Props) {
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  // Автопрокрутка к последнему сообщению.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const submit = () => {
    const clean = text.trim().replace(/\s+/g, ' ').slice(0, MAX_LEN);
    if (!clean) return;
    onSend(clean);
    setText('');
  };

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-4 py-2.5">
        <h2 className="text-[15px] font-semibold text-[color:var(--text)]">Чат</h2>
        {isHost && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-gold-400/40
                       bg-gold-400/10 px-2 py-0.5 text-sm font-semibold text-gold-300"
          >
            <IconCrown className="h-3.5 w-3.5" />
            вы хост
          </span>
        )}
        <span className="tnum ml-auto text-sm text-[color:var(--muted)]">
          {lines.length > 0 ? `${lines.length} сообщ.` : ''}
        </span>
      </div>

      <div
        ref={scroller}
        role="log"
        aria-label="Сообщения чата"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {lines.length === 0 ? (
          <p className="px-1 py-6 text-center text-[15px] leading-relaxed text-[color:var(--muted)]">
            Сообщений пока нет.
            <br />
            Напишите первым — все за столом вас услышат.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line, i) => (
              <Bubble
                key={line.id}
                line={line}
                grouped={i > 0 && lines[i - 1].from === line.from && lines[i - 1].mine === line.mine}
              />
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 border-t border-[color:var(--line)] p-2.5"
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={MAX_LEN}
          placeholder="Сообщение в комнату…"
          aria-label="Текст сообщения"
          className={INPUT}
        />
        <button type="submit" className={SEND_BTN} aria-label="Отправить сообщение" title="Отправить">
          <IconSend className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

export default Chat;
