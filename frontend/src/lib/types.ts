// Shared domain types mirroring schema.sql.

export type Role = 'admin' | 'member';

export interface User {
  id: number;
  name: string;
  avatar_url: string | null;
  ntfy_url: string | null;
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
  event_type: 'deadline' | 'payment' | 'appointment' | 'income';
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
