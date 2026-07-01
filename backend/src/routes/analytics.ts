import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { buildMonthlySpend, buildVariance, windowStart } from '../lib/analytics.js';

const clampMonths = (raw?: string) => Math.min(Math.max(parseInt(raw ?? '6', 10) || 6, 1), 24);

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/analytics/monthly-spend?months=6
  // Sums completed payment events linked to a money stream, per calendar month.
  // Events without a linked stream are excluded — there is no amount to attribute.
  app.get<{ Querystring: { months?: string } }>('/monthly-spend', async (req) => {
    const months = clampMonths(req.query.months);
    const now = new Date();
    const since = windowStart(months, now);
    const { rows } = await query<{ month: string; total: string }>(
      `SELECT to_char(date_trunc('month', e.target_date), 'YYYY-MM') AS month,
              SUM(COALESCE(e.actual_amount, s.amount)) AS total
         FROM household_events e
         JOIN money_streams s ON s.id = e.money_stream_id
        WHERE e.is_completed = TRUE
          AND e.event_type = 'payment'
          AND e.target_date >= $1
        GROUP BY 1`,
      [since],
    );
    return buildMonthlySpend(rows, months, now);
  });

  // GET /api/analytics/variance?months=6
  // Expected vs actual for completed payments, per calendar month. Expected is
  // the linked stream's amount; actual prefers the captured actual_amount.
  app.get<{ Querystring: { months?: string } }>('/variance', async (req) => {
    const months = clampMonths(req.query.months);
    const now = new Date();
    const since = windowStart(months, now);
    const { rows } = await query<{ month: string; expected: string; actual: string }>(
      `SELECT to_char(date_trunc('month', e.target_date), 'YYYY-MM') AS month,
              SUM(s.amount) AS expected,
              SUM(COALESCE(e.actual_amount, s.amount)) AS actual
         FROM household_events e
         JOIN money_streams s ON s.id = e.money_stream_id
        WHERE e.is_completed = TRUE
          AND e.event_type = 'payment'
          AND e.target_date >= $1
        GROUP BY 1`,
      [since],
    );
    return buildVariance(rows, months, now);
  });
};
