// Stage a realistic household for a design audit: people + a pet with
// birthdays, mixed money streams with categories, savings pots WITH
// attributed contributions, and events across every urgency bucket.
// Run against a FRESH database (the first register becomes admin):
//   node .claude/skills/design-award/scripts/seed.mjs
// Env: E2E_BASE_URL (default http://localhost:3000).
import { BASE, launch, signIn, post } from './lib.mjs';

const iso = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const { browser, page } = await launch();
const problems = [];

// First run on a fresh DB registers the admin; if the DB is already seeded
// this signs in instead (both land on the app shell).
await signIn(page, 'Alex', 'password123');

const put = await page.request.put(`${BASE}/api/settings/preferences`, {
  data: {
    country: 'GB', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London',
    language: 'en', household_name: 'Maple Cottage', theme: 'dark',
  },
});
if (!put.ok()) problems.push(`preferences: ${put.status()}`);

// --- Household ---------------------------------------------------------
const sam = await post(page, problems, '/users', { name: 'Sam', birthday: daysFromNow(16).replace(/^\d{4}/, '1990') });
const miso = await post(page, problems, '/users', { name: 'Miso', kind: 'pet', birthday: '2024-08-30' });

// --- Money streams (household currency comes from the API default) ------
const rent = await post(page, problems, '/money-streams', { name: 'Rent', amount: 1150, stream_type: 'expense', is_recurring: true, frequency: 'monthly', category: 'Housing' });
const councilTax = await post(page, problems, '/money-streams', { name: 'Council tax', amount: 180, stream_type: 'expense', is_recurring: true, frequency: 'monthly', category: 'Housing' });
await post(page, problems, '/money-streams', { name: 'Groceries', amount: 420, stream_type: 'expense', is_recurring: true, frequency: 'monthly', category: 'Food' });
await post(page, problems, '/money-streams', { name: 'Internet', amount: 35, stream_type: 'expense', is_recurring: true, frequency: 'monthly', category: 'Utilities', automated: true });
await post(page, problems, '/money-streams', { name: 'Electricity', amount: 95, stream_type: 'expense', is_recurring: true, frequency: 'monthly', category: 'Utilities' });
await post(page, problems, '/money-streams', { name: 'Car insurance', amount: 540, stream_type: 'expense', is_recurring: true, frequency: 'yearly', category: 'Transport' });
await post(page, problems, '/money-streams', { name: 'Salary', amount: 3200, stream_type: 'income', is_recurring: true, frequency: 'monthly' });
await post(page, problems, '/money-streams', { name: 'Freelance', amount: 400, stream_type: 'income', is_recurring: true, frequency: 'monthly' });
await post(page, problems, '/money-streams', { name: 'Holiday fund', amount: 250, stream_type: 'savings', is_recurring: true, frequency: 'monthly' });

// --- Savings pots + attributed contributions ----------------------------
// POST /savings/goals returns the whole summary; find ids by pot name.
const withJapan = await post(page, problems, '/savings/goals', { name: 'Japan trip', target_amount: 3000, icon: '🗾' });
const summary = (await post(page, problems, '/savings/goals', { name: 'Emergency fund', target_amount: 5000, icon: '🛟' })) ?? withJapan;
const potId = (name) => summary?.pots?.find((p) => p.name === name)?.id ?? null;
const japanId = potId('Japan trip');
const emergencyId = potId('Emergency fund');
if (!japanId || !emergencyId) problems.push('pot ids not found in summary — contributions will land in General');

await post(page, problems, '/savings/entries', { amount: 250, note: 'June transfer', occurred_on: daysFromNow(-32), goal_id: japanId });
await post(page, problems, '/savings/entries', { amount: 250, note: 'July transfer', occurred_on: daysFromNow(-2), goal_id: japanId });
await post(page, problems, '/savings/entries', { amount: 300, note: 'Bonus', occurred_on: daysFromNow(-18), goal_id: emergencyId });
await post(page, problems, '/savings/entries', { amount: 700, occurred_on: daysFromNow(-44), goal_id: emergencyId });
await post(page, problems, '/savings/entries', { amount: 120, note: 'Car boot sale', occurred_on: daysFromNow(-11) });

// --- Events: one per urgency bucket + a completed one -------------------
const mot = await post(page, problems, '/events', { title: 'Renew car MOT', event_type: 'deadline', target_date: daysFromNow(-5), description: 'Garage on Mill Road' });
const dentist = await post(page, problems, '/events', { title: 'Dentist — Sam', event_type: 'appointment', target_date: daysFromNow(3) });
await post(page, problems, '/events', { title: 'Council tax', event_type: 'payment', target_date: daysFromNow(5), money_stream_id: councilTax?.id ?? undefined });
await post(page, problems, '/events', { title: 'School enrolment forms', event_type: 'deadline', target_date: daysFromNow(19) });
await post(page, problems, '/events', { title: 'Vet check — Miso', event_type: 'appointment', target_date: daysFromNow(33) });
const bike = await post(page, problems, '/events', { title: 'Fix bicycle brakes', event_type: 'appointment', target_date: daysFromNow(-13) });
if (bike) await page.request.patch(`${BASE}/api/events/${bike.id}/complete`, { data: { is_completed: true } });

// --- Shopping list: a mid-week state, two things already in the basket ----
const shopping = ['Milk', 'Oat flakes', 'Dish soap', 'Coffee beans', 'Cat litter', 'Basil plant'];
const shopIds = [];
for (const name of shopping) {
  const it = await post(page, problems, '/shopping', { name });
  if (it) shopIds.push(it.id);
}
for (const id of shopIds.slice(0, 2)) {
  await page.request.patch(`${BASE}/api/shopping/${id}`, { data: { is_done: true } });
}

// --- Assignments ---------------------------------------------------------
const me = await page.request.get(`${BASE}/api/auth/me`).then((r) => r.json());
const myId = me.id ?? me.user?.id;
if (rent) await post(page, problems, '/assignments', { user_id: myId, money_stream_id: rent.id, role: 'owner' });
if (dentist && sam) await post(page, problems, '/assignments', { user_id: sam.id, event_id: dentist.id, role: 'owner' });
if (mot) await post(page, problems, '/assignments', { user_id: myId, event_id: mot.id, role: 'owner' });

// --- Gifts: two visible + one addressed to Alex (proves the hidden count) --
if (sam) {
  await post(page, problems, '/gifts', { recipient_id: sam.id, title: 'Record player', url: 'https://example.com/rp', link_site: 'example.com', price: 129.5, status: 'idea' });
}
if (miso) {
  await post(page, problems, '/gifts', { recipient_id: miso.id, title: 'Catnip fortress', price: 24, status: 'bought' });
}
if (myId) {
  await post(page, problems, '/gifts', { recipient_id: myId, title: 'Surprise for Alex' });
}

const savings = await page.request.get(`${BASE}/api/savings`).then((r) => r.json()).catch(() => null);
console.log(JSON.stringify({
  problems,
  pots: savings?.pots?.map((p) => ({ name: p.name, balance: p.balance, target: p.target })) ?? [],
}, null, 2));
await browser.close();
process.exit(problems.length ? 1 : 0);
