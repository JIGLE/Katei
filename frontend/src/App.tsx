import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { Modal } from './components/Modal';
import { SettingsForm } from './components/SettingsForm';
import { useAuth } from './lib/auth';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import MoneyFlow from './pages/MoneyFlow';
import Household from './pages/Household';

export default function App() {
  const { user, loading, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
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
      <header className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
        <span className="text-sm font-light tracking-wide text-zinc-300">
          家庭 <span className="text-zinc-600">·</span> {user.name}
        </span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.241.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={logout}
            className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
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

      <Modal open={showSettings} title="Notifications" onClose={() => setShowSettings(false)}>
        <SettingsForm onClose={() => setShowSettings(false)} />
      </Modal>
    </div>
  );
}
