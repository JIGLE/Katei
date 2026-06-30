interface SplashProps {
  /** When true the splash begins its fade-out, then unmounts via onDone. */
  leaving: boolean;
  onDone: () => void;
}

// Branded first-load animation: the 家庭 wordmark fades + scales in over a
// full-bleed dark field, with an emerald underline drawing beneath it. Honors
// prefers-reduced-motion via the keyframes in index.css (quick fade only).
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
        <span className="splash-mark text-5xl font-light tracking-widest text-zinc-100">
          家庭
        </span>
        <span className="splash-underline mt-3 h-px bg-emerald-500" />
      </div>
    </div>
  );
}
