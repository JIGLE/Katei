import { useEffect, useRef, useState, type RefObject } from 'react';

// The floating add button sits over the right edge of the page, which is
// exactly where dates, amounts and status pills live. Rather than shrink or
// move it, it steps aside:
//  - while the reader scrolls down through content (it comes back on a
//    scroll up, at the top, or at the end, where <main>'s end padding clears
//    it), and
//  - whenever, once the reader has scrolled, it would cover something marked
//    `data-fab-avoid` (a date pill, an amount). It comes back as soon as that
//    row has moved out from under it. At the top of the page it always shows,
//    so the main action is there on arrival.
// A focused button never hides, so keyboard users can always reach it.
//
// The app scrolls <main>, not the window, so that's what this listens to.
export function useFabVisible(pinned = false, fabRef?: RefObject<HTMLElement | null>): boolean {
  const [scrollVisible, setScrollVisible] = useState(true);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    if (pinned) {
      setScrollVisible(true);
      setCovering(false);
      return;
    }
    const main = document.querySelector('main');
    if (!main) return;
    let last = main.scrollTop;
    let frame = 0;

    // Where the button rests, ignoring its own slide-away transform:
    // offsetTop/Left of a fixed element are viewport positions.
    const checkCovering = () => {
      frame = 0;
      const fab = fabRef?.current;
      if (!fab) return;
      // On arrival the page's main action always shows.
      if (main.scrollTop < 80) {
        setCovering(false);
        return;
      }
      const left = fab.offsetLeft - 4;
      const top = fab.offsetTop - 4;
      const right = left + fab.offsetWidth + 8;
      const bottom = top + fab.offsetHeight + 8;
      let hit = false;
      for (const el of main.querySelectorAll<HTMLElement>('[data-fab-avoid]')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > left && r.left < right && r.bottom > top && r.top < bottom) {
          hit = true;
          break;
        }
      }
      setCovering(hit);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(checkCovering);
    };

    const onScroll = () => {
      const y = main.scrollTop;
      const delta = y - last;
      const nearTop = y < 80;
      const atEnd = y + main.clientHeight >= main.scrollHeight - 8;
      if (nearTop || atEnd || delta < -4) setScrollVisible(true);
      else if (delta > 4) setScrollVisible(false);
      last = y;
      schedule();
    };
    // Rows arrive after the first paint and move when filters change, so
    // re-check whenever the page's content changes too.
    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    main.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      main.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pinned, fabRef]);

  return scrollVisible && !covering;
}

// Classes that slide the button just below its resting place and fade it.
// Transform + opacity only, and only a transition — nothing fills forwards.
export function fabVisibilityCls(visible: boolean): string {
  return [
    'transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-enter)] motion-reduce:transition-none',
    visible
      ? 'translate-y-0 opacity-100'
      : 'pointer-events-none translate-y-4 opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100',
  ].join(' ');
}

const PLUS = 'M12 4.5v15m7.5-7.5h-15';

// The page's one primary create action. See BRAND.md §7.
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useFabVisible(false, ref);
  return (
    <div
      ref={ref}
      data-fab
      data-fab-hidden={visible ? undefined : ''}
      className={`fixed bottom-fab right-4 z-40 ${fabVisibilityCls(visible)}`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg
          aria-hidden
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={PLUS} />
        </svg>
      </button>
    </div>
  );
}
