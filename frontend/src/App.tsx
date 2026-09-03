import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { Modal } from './components/Modal';
import { SettingsForm } from './components/SettingsForm';
import { AccountForm } from './components/AccountForm';
import { Splash } from './components/Splash';
import { Logo } from './components/Logo';
import { useAuth } from './lib/auth';
import { usePreferences } from './lib/preferences';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import Lists from './pages/Lists';
import MoneyFlow from './pages/MoneyFlow';
import Household from './pages/Household';
import PublicGiftList from './pages/PublicGiftList';

// Minimum time the branded splash stays up so it never just flashes.
const SPLASH_MIN_MS = 900;

export default function App() {
  const { user, loading } = useAuth();
  const { loading: prefsLoading, money_enabled } = usePreferences();
  const { t } = useTranslation();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // Splash lifecycle: shown on first load, fades once data is ready and the
  // minimum display time has elapsed, then unmounts.
  const [splashGone, setSplashGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(id);
  }, []);
  const ready = !loading && !prefsLoading && minElapsed;

  // A gift-list share link has no session and no app chrome — reachable
  // regardless of auth state, skipping the splash and sign-in gate an
  // outside visitor has no business seeing.
  if (location.pathname.startsWith('/gift/')) {
    return (
      <Routes>
        <Route path="/gift/:token" element={<PublicGiftList />} />
      </Routes>
    );
  }

  if (!splashGone) {
    return <Splash leaving={ready} onDone={() => setSplashGone(true)} />;
  }

  if (!user) {
    return (
      <div className="h-full bg-zinc-950">
        <AuthGate />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Slim header — the account control and notifications both live in
          the bottom nav's merged avatar control instead. */}
      <header className="flex items-center border-b border-zinc-800/60 px-4 py-2.5">
        <Logo size="sm" withWordmark className="text-zinc-300" />
      </header>

      {/* Scrollable content area — padded above the fixed bottom nav plus
          the floating add button's envelope, so the last row's right edge
          is never trapped underneath it. */}
      <main className="flex-1 overflow-y-auto pb-44">
        {/* Keyed on the path so each tab change re-runs the calm reveal.
            Opacity-only: a transform here would become the containing block
            for the pages' position:fixed add buttons and un-float them. */}
        <div key={location.pathname} className="animate-fade-in mx-auto max-w-lg px-4 pt-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/money" element={money_enabled ? <MoneyFlow /> : <Navigate to="/" replace />} />
            <Route path="/lists" element={<Lists />} />
            <Route path="/household" element={<Household />} />
          </Routes>
        </div>
      </main>

      <BottomNav onOpenAccount={() => setShowAccount(true)} onOpenSettings={() => setShowSettings(true)} />

      <Modal open={showAccount} title={t('account.title')} onClose={() => setShowAccount(false)}>
        <AccountForm onClose={() => setShowAccount(false)} />
      </Modal>

      <Modal open={showSettings} title={t('common.settings')} onClose={() => setShowSettings(false)}>
        <SettingsForm onClose={() => setShowSettings(false)} />
      </Modal>
    </div>
  );
}
