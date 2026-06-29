import { Routes, Route } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import MoneyFlow from './pages/MoneyFlow';
import Household from './pages/Household';

export default function App() {
  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Scrollable content area — padded above the fixed bottom nav */}
      <main className="flex-1 overflow-y-auto pb-28">
        <div className="mx-auto max-w-lg px-4 pt-10">
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
