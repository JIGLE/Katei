import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface SavingsRingProps {
  /** 0–100 */
  pct: number;
  label: string;
  size?: number;
}

// A circular progress ring for the savings goal — the one deliberately
// distinctive element on Money (see BRAND.md §5: savings = teal), replacing a
// generic linear bar. Fills from 0 to `pct` once on first reveal; honors
// reduced motion by jumping straight to the final value.
export function SavingsRing({ pct, label, size = 92 }: SavingsRingProps) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const [animatedPct, setAnimatedPct] = useState(0);
  const animatedOnce = useRef(false);

  useEffect(() => {
    if (animatedOnce.current || prefersReducedMotion()) {
      animatedOnce.current = true;
      setAnimatedPct(pct);
      return;
    }
    animatedOnce.current = true;
    let raf: number;
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedPct(pct * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  const offset = circumference - (animatedPct / 100) * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-zinc-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-teal-400"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-light tabular-nums text-teal-300">{Math.round(pct)}%</span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
