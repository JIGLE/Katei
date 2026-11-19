// The secondary add action that sits at the right of a section header:
// "+ Add to savings", "+ New pot", "+ Add a gift". One look everywhere,
// neutral (adding is not time or money), and opening a sheet like the
// page's main add button. See BRAND.md §7, Adding things.
export function SectionAdd({
  label,
  onClick,
  disabled,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex-shrink-0 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
    >
      <span aria-hidden>+ </span>
      {label}
    </button>
  );
}
