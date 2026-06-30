// Shared domain types mirroring schema.sql.

export interface User {
  id: number;
  name: string;
  avatar_url: string | null;
  ntfy_url: string | null;
  created_at: string;
}

export interface MoneyStream {
  id: number;
  name: string;
  amount: string; // DECIMAL comes back as string from pg
  currency: string;
  is_recurring: boolean;
  frequency: 'monthly' | 'yearly' | 'one-off';
  category: string | null;
  created_at: string;
}

export interface HouseholdEvent {
  id: number;
  title: string;
  description: string | null;
  event_type: 'deadline' | 'payment' | 'appointment';
  target_date: string; // ISO date string
  is_completed: boolean;
  money_stream_id: number | null;
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
