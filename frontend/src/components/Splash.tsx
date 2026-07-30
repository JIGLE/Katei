import { Logo } from './Logo';

interface SplashProps {
  /** When true the splash begins its fade-out, then unmounts via onDone. */
  leaving: boolean;
  onDone: () => void;
}

// Branded first-load animation: the monogram's three strokes draw themselves in
// over a full-bleed dark field, the wordmark fades up, and an emerald underline
// draws beneath. Honors prefers-reduced-motion via the keyframes in index.css
// (quick fade, no drawing).
export function Splash({ leaving, onDone }: SplashProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 transition-opacity duration-500 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      onTransitionEnd={() => {
        if (leaving) onDone();
      }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center">
        <Logo size="lg" withWordmark markClassName="splash-mark" className="splash-lockup text-zinc-100" />
        <span className="splash-underline mt-3 h-px bg-emerald-500" />
      </div>
    </div>
  );
}
