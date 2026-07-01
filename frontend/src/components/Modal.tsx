import { useEffect, useState } from 'react';
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

// A mobile-first bottom sheet. Slides up from the bottom to echo the
// fixed bottom navigation; on larger screens it stays centred-bottom and
// capped at the same max width as the app content. Animates in on open and
// out on close (transform/opacity only) instead of popping in/out instantly.
export function Modal({ open, title, onClose, children }: ModalProps) {
  const { t } = useTranslation();
  // `mounted` keeps the sheet in the DOM for the exit animation; `entered`
  // drives the actual transition (a frame must paint in the "closed" position
  // before flipping this, or the browser has nothing to transition from).
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      {/* Backdrop */}
      <button
        aria-label={t('common.close')}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-[var(--dur-base)] ease-[var(--ease-enter)] motion-reduce:transition-none ${entered ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Sheet — capped at the viewport so a tall form scrolls instead of
          overflowing off-screen; the handle + header stay pinned. */}
      <div
        className={`relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl border border-zinc-800/60 bg-zinc-900 shadow-2xl transition-transform duration-[var(--dur-slow)] ease-[var(--ease-drawer)] motion-reduce:transition-none ${entered ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex-shrink-0 px-5 pt-5">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700" />

          <header className="flex items-center justify-between">
            <h2 className="text-lg font-light text-zinc-100">{title}</h2>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-5">
          {children}
        </div>
      </div>
    </div>
  );
}
