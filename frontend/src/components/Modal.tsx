import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

// How long the exit transition runs before the sheet actually unmounts.
// Keep in sync with the CSS duration below (var(--dur-slow) = 320ms; a touch
// less here is fine — unmounting slightly after motion settles is invisible).
const EXIT_MS = 300;

// Drag-down-to-close: past this distance, or flicked faster than this, the
// sheet closes on release; otherwise it springs back.
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 0.5; // px per ms

// What can hold focus inside the sheet, for initial focus and the Tab trap.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tracks the on-screen keyboard's footprint via visualViewport so the sheet
// can stay above it. `position: fixed` content lays out against the layout
// viewport on iOS, so the keyboard opening doesn't move or resize anything by
// itself — inset pushes the bottom-aligned sheet up, maxHeight shrinks it to
// what's actually left above the keyboard. Either alone breaks: inset-only
// lets the sheet overflow off the top of the screen, maxHeight-only sizes it
// right but leaves its bottom under the keyboard. Where visualViewport isn't
// supported, both stay at their no-op defaults and the static max-h-[90dvh]
// class below is the entire fallback — pure progressive enhancement.
export function useKeyboardInset(active: boolean) {
  const [state, setState] = useState<{ inset: number; maxHeight: number | undefined }>({
    inset: 0,
    maxHeight: undefined,
  });
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      setState({ inset, maxHeight: inset > 0 ? Math.round(vv.height * 0.9) : undefined });
    };
    onResize();
    vv.addEventListener('resize', onResize);
    // iOS also fires this when it auto-pans the page to keep a focused field visible.
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      setState({ inset: 0, maxHeight: undefined });
    };
  }, [active]);
  return state;
}

// A mobile-first bottom sheet. Slides up from the bottom to echo the
// fixed bottom navigation; on larger screens it stays centred-bottom and
// capped at the same max width as the app content. Animates in on open and
// out on close (transform/opacity only) instead of popping in/out instantly.
//
// Accessibility: a labelled dialog that takes focus on open, keeps Tab
// cycling inside itself, closes on Escape, and hands focus back to the
// trigger on close. The page behind cannot scroll while it is up.
export function Modal({ open, title, onClose, children }: ModalProps) {
  const { t } = useTranslation();
  // `mounted` keeps the sheet in the DOM for the exit animation; `entered`
  // drives the actual transition (a frame must paint in the "closed" position
  // before flipping this, or the browser has nothing to transition from).
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { inset, maxHeight } = useKeyboardInset(open);
  // Live offset while the sheet's top is dragged down. It is kept after a
  // closing release so the exit slides on from where the finger let go.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ id: number; y0: number; t: number; y: number } | null>(null);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input')) return;
    dragRef.current = { id: e.pointerId, y0: e.clientY, t: e.timeStamp, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - d.y0));
    d.t = e.timeStamp;
    d.y = e.clientY;
  };
  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const dy = Math.max(0, e.clientY - d.y0);
    // Speed over the last move only, so a slow drag ending in a flick counts.
    const dt = Math.max(1, e.timeStamp - d.t);
    const v = (e.clientY - d.y) / dt;
    if (dy > DRAG_CLOSE_PX || (dy > 16 && v > DRAG_CLOSE_VELOCITY)) onClose();
    else setDragY(0);
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Move focus into the dialog on open and back to the trigger on close.
  // A child that focuses itself (autoFocus fields) wins over the default.
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => {
        const sheet = sheetRef.current;
        if (!sheet || sheet.contains(document.activeElement)) return;
        (sheet.querySelector<HTMLElement>(FOCUSABLE) ?? sheet).focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    restoreRef.current?.focus();
    restoreRef.current = null;
  }, [open]);

  // The page behind the sheet must not scroll while it is up. The app's
  // scroller is the <main> element (App.tsx), not <body> — body never
  // scrolls, so locking it alone would be a no-op while wheel/drag events
  // bubbling out of the sheet could still move the page behind.
  useEffect(() => {
    if (!open) return;
    const scroller = document.querySelector<HTMLElement>('main') ?? document.body;
    const previous = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => {
      scroller.style.overflow = previous;
    };
  }, [open]);

  // Close on Escape; keep Tab (and Shift+Tab) cycling inside the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !sheet.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !sheet.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      style={{ paddingBottom: inset || undefined }}
      className="fixed inset-0 z-[60] flex items-end justify-center transition-[padding-bottom] duration-200 ease-out motion-reduce:transition-none"
    >
      {/* Backdrop — pointer dismissal only. Escape and the header button
          already cover keyboards, so it is not a tab stop. */}
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-[var(--dur-base)] ease-[var(--ease-enter)] motion-reduce:transition-none ${entered ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Sheet — capped at the viewport so a tall form scrolls instead of
          overflowing off-screen; the handle + header stay pinned. maxHeight
          overrides the static 90dvh cap once a keyboard is actually open. */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          maxHeight,
          transform: entered && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : undefined,
        }}
        className={`relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl border border-zinc-800/60 bg-zinc-900 shadow-2xl outline-none transition-[transform,max-height] duration-[var(--dur-slow)] ease-[var(--ease-drawer)] motion-reduce:transition-none ${entered ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* The handle and header are the drag area: pull down to dismiss. */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          data-sheet-handle
          className="flex-shrink-0 touch-none select-none px-5 pt-5"
        >
          <div aria-hidden className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700" />

          <header className="flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-light text-zinc-100">{title}</h2>
            <button
              onClick={onClose}
              className="text-zinc-500 transition-colors hover:text-zinc-300"
              aria-label={t('common.close')}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-sheet-end pt-5">
          {children}
        </div>
      </div>
    </div>
  );
}
