// Continuous chronological stream of upcoming dates, milestones, and events.

const sampleEvents = [
  { date: 'Jul 1', title: 'Rent payment', type: 'payment', accent: 'emerald' },
  { date: 'Jul 8', title: 'Dentist appointment', type: 'appointment', accent: 'amber' },
  { date: 'Jul 15', title: 'Car registration deadline', type: 'deadline', accent: 'rose' },
  { date: 'Jul 22', title: 'Internet renewal', type: 'payment', accent: 'emerald' },
];

const accentMap = {
  amber: 'text-amber-500 border-amber-500/30',
  emerald: 'text-emerald-500 border-emerald-500/30',
  rose: 'text-rose-500 border-rose-500/30',
} as const;

type Accent = keyof typeof accentMap;

export default function Timeline() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Planning</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Timeline</h1>
      </header>

      <section className="space-y-3">
        {sampleEvents.map((evt) => (
          <div
            key={evt.title}
            className="flex items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
          >
            {/* Date column */}
            <div className={`w-14 flex-shrink-0 border-r pr-4 text-center text-xs font-medium ${accentMap[evt.accent as Accent]}`}>
              {evt.date}
            </div>

            {/* Content */}
            <div className="flex-1">
              <p className="text-sm text-zinc-100">{evt.title}</p>
              <p className="mt-0.5 text-xs capitalize text-zinc-500">{evt.type}</p>
            </div>

            {/* Status indicator */}
            <div className="h-2 w-2 rounded-full bg-zinc-700" />
          </div>
        ))}
      </section>

      <p className="text-center text-xs text-zinc-600">
        Live events load from /api/events in the next phase.
      </p>
    </div>
  );
}
