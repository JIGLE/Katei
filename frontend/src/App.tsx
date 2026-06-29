import { Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { useAuth } from './lib/auth';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import MoneyFlow from './pages/MoneyFlow';
import Household from './pages/Household';

export default function App() {
  const { user, loading, logout } = useAuth();

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
        <button
          onClick={logout}
          className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
        >
          Sign out
        </button>
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
    </div>
  );
}
