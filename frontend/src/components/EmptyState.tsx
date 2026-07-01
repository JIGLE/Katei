// A warm, consistent empty state — a soft icon, a line about what's missing, and
// an optional nudge toward the next action. Used across pages so "nothing here
// yet" always feels inviting rather than broken.

interface EmptyStateProps {
  icon?: string; // an emoji, sized up as the visual anchor
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = '·', title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 px-6 py-10 text-center">
      <div className="mx-auto mb-3 text-3xl leading-none" aria-hidden>{icon}</div>
      <p className="text-sm text-zinc-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">{hint}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
