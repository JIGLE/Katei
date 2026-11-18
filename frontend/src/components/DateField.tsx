import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';

// A date field that reads in the household's format ("Tue, 17 November 2026"
// for en-GB, "Di., 17. November 2026" for de-DE), not the browser's. The
// native date input still sits on top, invisible, so a tap opens the phone's
// own picker and keyboard entry keeps working.

interface Props {
  id: string;
  value: string; // YYYY-MM-DD or ''
  onChange: (value: string) => void;
  required?: boolean;
}

function formatDate(value: string, locale: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return value;
  }
}

export default function DateField({ id, value, onChange, required }: Props) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  const shown = formatDate(value, locale);

  return (
    <div className="relative">
      <input
        id={id}
        type="date"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* the browser opens its own picker */
          }
        }}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <div
        aria-hidden="true"
        data-date-display
        className={
          'flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-800 ' +
          'bg-zinc-950 px-3 py-2.5 text-sm peer-focus-visible:border-zinc-600 ' +
          'peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-600 ' +
          (shown ? 'text-zinc-100' : 'text-zinc-500')
        }
      >
        <span className="truncate">{shown ?? t('form.pickDate')}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4 shrink-0 text-zinc-400"
        >
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
