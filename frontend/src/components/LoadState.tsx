import { useTranslation } from 'react-i18next';

// Shared loading and error states for lists (BRAND.md §7, Loading and errors).
// Loading shows the shape of what's coming instead of a "Loading…" line, so
// the page doesn't jump when rows arrive; a failed load says so quietly and
// offers one way forward.

/** Placeholder rows shaped like a list card. Pulses gently; holds still
    under reduced motion. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-busy="true"
      data-skeleton
      className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900"
    >
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="flex h-14 items-center gap-3 px-4">
          <span className="h-5 w-5 flex-shrink-0 rounded-full bg-zinc-800 motion-safe:animate-pulse" />
          <span
            className="h-3 rounded-full bg-zinc-800 motion-safe:animate-pulse"
            style={{ width: `${[55, 40, 65, 48][i % 4]}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** A load that failed: a plain sentence and "Try again". The raw server
    message stays out of the UI; it's in the console for whoever needs it. */
export function ErrorRow({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900 px-4 py-3"
    >
      <p className="text-sm text-rose-400">{t('common.loadFailed')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex-shrink-0 rounded-xl border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-700"
      >
        {t('common.tryAgain')}
      </button>
    </div>
  );
}
