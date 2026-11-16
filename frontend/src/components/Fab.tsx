import { useEffect, useState } from 'react';

// The floating add button sits over the right edge of the page, which is
// exactly where amounts and status pills live. Rather than shrink or move it,
// it steps aside while the reader is scrolling down through content and comes
// back the moment they scroll up, return to the top, or reach the end (where
// <main>'s end padding already clears it). A focused button never hides, so
// keyboard users can always reach it.
//
// The app scrolls <main>, not the window, so that's what this listens to.
export function useFabVisible(pinned = false): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (pinned) {
      setVisible(true);
      return;
    }
    const main = document.querySelector('main');
    if (!main) return;
    let last = main.scrollTop;
    const onScroll = () => {
      const y = main.scrollTop;
      const delta = y - last;
      const nearTop = y < 80;
      const atEnd = y + main.clientHeight >= main.scrollHeight - 8;
      if (nearTop || atEnd || delta < -4) setVisible(true);
      else if (delta > 4) setVisible(false);
      last = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [pinned]);

  return visible;
}

// Classes that slide the button just below its resting place and fade it.
// Transform + opacity only, and only a transition — nothing fills forwards.
export function fabVisibilityCls(visible: boolean): string {
  return [
    'transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-enter)] motion-reduce:transition-none',
    visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100',
  ].join(' ');
}

const PLUS = 'M12 4.5v15m7.5-7.5h-15';

// The page's one primary create action. See BRAND.md §7.
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  const visible = useFabVisible();
  return (
    <div className={`fixed bottom-fab right-4 z-40 ${fabVisibilityCls(visible)}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg aria-hidden className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={PLUS} />
        </svg>
      </button>
    </div>
  );
}
