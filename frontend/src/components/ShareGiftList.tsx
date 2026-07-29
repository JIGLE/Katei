import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

interface ShareGiftListProps {
  listId: number;
}

// Opt-in, revocable link-sharing for a single gift list — mirrors the
// household calendar feed's copy/regenerate block in SettingsForm, but with
// an explicit on/off toggle since sharing here defaults to off per list.
export function ShareGiftList({ listId }: ShareGiftListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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
    } catch { /* stays collapsed */ }
    setBusy(false);
  };

  const toggleOpen = () => {
    if (!open && !loaded) load();
    setOpen((o) => !o);
    setCopied(false);
  };

  const mintOrRotate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ share_token: string }>(`/gift-lists/${listId}/share`, {});
      setToken(r.share_token);
      setCopied(false);
    } catch { /* keep prior state */ }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    try {
      await api.delete(`/gift-lists/${listId}/share`);
      setToken(null);
      setCopied(false);
    } catch { /* keep prior state */ }
    setBusy(false);
  };

  const shareUrl = token ? `${window.location.origin}/gift/${token}` : '';
  const copy = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); } catch { /* clipboard blocked */ }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
      >
        {t('gifts.share')}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-zinc-800/60 bg-zinc-950 p-3">
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">{t('gifts.shareIntro')}</p>
          {busy && !loaded && <p className="text-xs text-zinc-600">{t('common.loading')}</p>}
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
                <p className="mb-1 text-xs text-zinc-500">{copied ? t('gifts.shareCopied') : t('gifts.shareUrl')}</p>
                <p className="break-all text-xs text-zinc-300">{shareUrl}</p>
              </button>
              <div className="flex gap-4">
                <button type="button" onClick={mintOrRotate} disabled={busy} className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300">
                  {t('gifts.shareRegenerate')}
                </button>
                <button type="button" onClick={disable} disabled={busy} className="text-xs text-rose-400/80 underline-offset-2 transition-colors hover:text-rose-400">
                  {t('gifts.shareDisable')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
