import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { Modal } from './components/Modal';
import { SettingsForm } from './components/SettingsForm';
import { Splash } from './components/Splash';
import { AccountMenu } from './components/AccountMenu';
import { useAuth } from './lib/auth';
import { usePreferences } from './lib/preferences';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import MoneyFlow from './pages/MoneyFlow';
import Household from './pages/Household';

// Minimum time the branded splash stays up so it never just flashes.
const SPLASH_MIN_MS = 900;

export default function App() {
  const { user, loading } = useAuth();
  const { loading: prefsLoading } = usePreferences();
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  // Splash lifecycle: shown on first load, fades once data is ready and the
  // minimum display time has elapsed, then unmounts.
  const [splashGone, setSplashGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(id);
  }, []);
  const ready = !loading && !prefsLoading && minElapsed;

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
      {/* Slim account header */}
      <header className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2.5">
        <span className="text-base font-light tracking-widest text-zinc-300">家庭</span>
        <AccountMenu user={user} onOpenSettings={() => setShowSettings(true)} />
      </header>

      {/* Scrollable content area — padded above the fixed bottom nav */}
      <main className="flex-1 overflow-y-auto pb-28">
        <div className="mx-auto max-w-lg px-4 pt-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/money" element={<MoneyFlow />} />
            <Route path="/household" element={<Household />} />
          </Routes>
        </div>
      </main>

      <BottomNav />

      <Modal open={showSettings} title={t('settings.notificationsTitle')} onClose={() => setShowSettings(false)}>
        <SettingsForm onClose={() => setShowSettings(false)} />
      </Modal>
    </div>
  );
}
