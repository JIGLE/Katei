// Shared domain types mirroring schema.sql.

export type Role = 'admin' | 'member';

export type MemberKind = 'human' | 'pet';

export interface User {
  id: number;
  name: string;
  email: string | null;
  avatar_url: string | null;
  ntfy_url: string | null;
  kind: MemberKind;
  birthday: string | null; // 'YYYY-MM-DD'
  role: Role;
  created_at: string;
}

// A pending/used invite code (admin view).
export interface Invite {
  id: number;
  code: string;
  role: Role;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
  created_by_name: string | null;
  used_by_name: string | null;
  active: boolean;
}

export type StreamType = 'income' | 'expense' | 'savings';
export type DueShift = 'none' | 'prev' | 'next';

export interface MoneyStream {
  id: number;
  name: string;
  amount: string; // DECIMAL comes back as string from pg
  currency: string;
  is_recurring: boolean;
  frequency: 'monthly' | 'yearly' | 'one-off';
  category: string | null;
  stream_type: StreamType;
  due_day: number;
  due_shift: DueShift;
  automated: boolean;
  created_at: string;
}

export interface HouseholdEvent {
  id: number;
  title: string;
  description: string | null;
  event_type: 'deadline' | 'payment' | 'appointment' | 'income' | 'savings';
  target_date: string; // ISO date string
  is_completed: boolean;
  money_stream_id: number | null;
  actual_amount: string | null; // amount actually paid, captured at "mark as paid"
  created_at: string;
}

export interface Assignment {
  id: number;
  user_id: number;
  event_id: number | null;
  money_stream_id: number | null;
  role: string;
}

// Extended assignment row joined with user name + avatar for display.
export interface AssignmentDetail extends Assignment {
  user_name: string;
  user_avatar: string | null;
}

// A household activity-log entry (GET /api/activity). The client renders the
// (action, summary) pair into a localized sentence — no prose is stored.
export type ActivityAction =
  | 'stream_added'
  | 'event_added'
  | 'event_done'
  | 'payment_paid'
  | 'member_added'
  | 'savings_added';

export interface Activity {
  id: number;
  action: ActivityAction;
  summary: string;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_avatar: string | null;
}

// A single savings ledger entry (contribution or withdrawal).
export interface SavingsEntry {
  id: number;
  amount: string; // DECIMAL as string from pg
  note: string | null;
  occurred_on: string; // 'YYYY-MM-DD'
  money_stream_id: number | null;
  goal_id: number | null;
  created_at: string;
}

// A savings pot — a named goal money is set aside toward.
export interface SavingsPot {
  id: number;
  name: string;
  target: number | null;
  icon: string | null;
  is_default: boolean;
  balance: number;
  entries: SavingsEntry[];
}

// The household savings picture (GET /api/savings): opening balance the household
// already had + everything contributed since = the running balance, split across pots.
export interface SavingsSummary {
  opening: number;
  contributed: number;
  balance: number;
  entries: SavingsEntry[];
  pots: SavingsPot[];
}

// An in-app notification (the header bell), scoped to the current member.
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  event_id: number | null;
  read_at: string | null;
  created_at: string;
}

// One month of completed-payment spend (GET /api/analytics/monthly-spend).
export interface MonthlySpend {
  month: string; // 'YYYY-MM'
  total: number;
}

// Expected vs actual for paid bills, per month (GET /api/analytics/variance).
export interface MonthVariance {
  month: string;
  expected: number;
  actual: number;
}
