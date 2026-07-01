import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animate a numeric display value counting up from 0 to `target`, once — the
 * first time `ready` becomes true (e.g. loading finished). Later changes to
 * `target` (a background refresh, an edit) apply immediately with no replay,
 * so this never re-animates on unrelated re-renders. Honors reduced motion.
 */
export function useCountUp(target: number, ready: boolean, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const animatedOnce = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (animatedOnce.current || prefersReducedMotion()) {
      animatedOnce.current = true;
      setValue(target);
      return;
    }
    animatedOnce.current = true;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — matches --ease-enter's feel
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, target, durationMs]);

  return value;
}
