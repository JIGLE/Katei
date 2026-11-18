import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

// A list header's share control: an icon button that toggles the panel below.
export function ShareButton({
  open,
  onClick,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  controls: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('gifts.share')}
      aria-expanded={open}
      aria-controls={controls}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${open ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
    >
      <svg
        aria-hidden
        className="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
        />
      </svg>
    </button>
  );
}

// Opt-in, revocable link-sharing for a single gift list — mirrors the
// household calendar feed's copy/regenerate block in SettingsForm, but with
// an explicit on/off toggle since sharing here defaults to off per list.
// Mounted only while open, so it loads the link state when it appears.
export function ShareGiftPanel({ listId, id }: { listId: number; id: string }) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const r = await api.get<{ share_token: string | null }>(`/gift-lists/${listId}/share`);
      setToken(r.share_token);
      setLoaded(true);
    } catch {
      /* stays collapsed */
    }
    setBusy(false);
  };

  useEffect(() => {
    load();
    // Load once per mount; the panel unmounts when closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mintOrRotate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ share_token: string }>(`/gift-lists/${listId}/share`, {});
      setToken(r.share_token);
      setCopied(false);
    } catch {
      /* keep prior state */
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.delete(`/gift-lists/${listId}/share`);
      setToken(null);
      setCopied(false);
    } catch {
      /* keep prior state */
    }
    setBusy(false);
  };

  const shareUrl = token ? `${window.location.origin}/gift/${token}` : '';
  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div id={id} className="rounded-xl border border-zinc-800/60 bg-zinc-950 p-3">
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">{t('gifts.shareIntro')}</p>
      {busy && !loaded && <p className="text-xs text-zinc-500">{t('common.loading')}</p>}
      {loaded && !token && (
        <button
          type="button"
          onClick={mintOrRotate}
          disabled={busy}
          className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {t('gifts.shareEnable')}
        </button>
      )}
      {token && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={copy}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-left"
          >
            <p className="mb-1 text-xs text-zinc-500">
              {copied ? t('gifts.shareCopied') : t('gifts.shareUrl')}
            </p>
            <p className="break-all text-xs text-zinc-300">{shareUrl}</p>
          </button>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={mintOrRotate}
              disabled={busy}
              className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
            >
              {t('gifts.shareRegenerate')}
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-xs text-rose-400/80 underline-offset-2 transition-colors hover:text-rose-400"
            >
              {t('gifts.shareDisable')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
