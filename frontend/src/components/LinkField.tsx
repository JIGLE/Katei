import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { LinkPreview } from '../lib/types';

const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

interface LinkFieldProps {
  id: string;
  url: string;
  onChange: (url: string) => void;
  /** Parsed metadata arrives here; empty title fields can adopt meta.title. */
  onParsed: (meta: LinkPreview) => void;
  parsedTitle?: string | null;
  parsedSite?: string | null;
}

/**
 * A URL input that quietly asks the server for the page's title on paste or
 * blur. Parsing is a bonus, never a blocker: failures keep the raw link and
 * say nothing — the link still works.
 */
export function LinkField({ id, url, onChange, onParsed, parsedTitle, parsedSite }: LinkFieldProps) {
  const { t } = useTranslation();
  const [fetching, setFetching] = useState(false);
  const lastParsed = useRef<string>('');

  const parse = async (raw: string) => {
    const value = raw.trim();
    if (!value || value === lastParsed.current || !/^https?:\/\//i.test(value)) return;
    lastParsed.current = value;
    setFetching(true);
    try {
      const meta = await api.post<LinkPreview>('/link-preview', { url: value });
      onParsed(meta);
    } catch {
      // Silent: the pasted link is stored as-is.
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
        {t('form.link')}
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => parse(e.target.value)}
        onPaste={(e) => parse(e.clipboardData.getData('text'))}
        placeholder={t('form.linkPlaceholder')}
        maxLength={2000}
        className={fieldCls}
      />
      {fetching ? (
        <p className="mt-1.5 text-xs text-zinc-500">{t('form.linkFetching')}</p>
      ) : (parsedTitle || parsedSite) ? (
        <p className="mt-1.5 truncate text-xs text-zinc-500">
          {parsedTitle && <span className="text-zinc-400">{parsedTitle}</span>}
          {parsedTitle && parsedSite ? ' · ' : ''}
          {parsedSite}
        </p>
      ) : null}
    </div>
  );
}

/** The clickable "amazon.de ↗" chip shown wherever a stored link surfaces. */
export function DomainChip({ url, site }: { url: string; site?: string | null }) {
  let domain = site ?? '';
  if (!domain) {
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { domain = url; }
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-[10rem] flex-shrink-0 items-center gap-1 rounded-full border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
    >
      <span className="truncate">{domain}</span>
      <svg aria-hidden className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  );
}
