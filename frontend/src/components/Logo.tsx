// The Katei mark: a K drawn as three hairline strokes — one upright, two
// diagonals meeting it at the same point. Set in the app's icon language
// (stroke-width 1.5, round caps, currentColor) so it sits beside the interface
// rather than on top of it. The single source of truth for every render site;
// see BRAND.md §1.

interface LogoProps {
  /** Height of the mark in rem-ish Tailwind units; the wordmark scales with it. */
  size?: 'sm' | 'md' | 'lg';
  /** Lay the wordmark "katei" beside the mark. */
  withWordmark?: boolean;
  /** Applied to the mark's <svg> — used by the splash to drive its draw. */
  markClassName?: string;
  className?: string;
}

const markSize: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-12 w-12',
};

const wordSize: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-4xl',
};

const gap: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-4',
};

// The three strokes, on a 24-box with a 4-unit margin. The diagonals meet the
// upright at its midpoint (4,12), so the joint is a single point rather than a
// crossing — the detail that keeps it reading as a monogram, not a letter K
// from a typeface.
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      className={className}
    >
      <path className="logo-stroke logo-stroke-1" d="M4 3.5v17" />
      <path className="logo-stroke logo-stroke-2" d="M4 12L19 3.5" />
      <path className="logo-stroke logo-stroke-3" d="M4 12l15 8.5" />
    </svg>
  );
}

export function Logo({ size = 'md', withWordmark = false, markClassName = '', className = '' }: LogoProps) {
  if (!withWordmark) {
    return <LogoMark className={`${markSize[size]} ${markClassName} ${className}`} />;
  }
  return (
    <span className={`inline-flex items-center ${gap[size]} ${className}`}>
      <LogoMark className={`${markSize[size]} flex-shrink-0 ${markClassName}`} />
      <span className={`${wordSize[size]} font-light lowercase tracking-[0.2em]`}>katei</span>
    </span>
  );
}
