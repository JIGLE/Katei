import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { buildMonthlySpend, windowStart } from '../lib/analytics.js';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/analytics/monthly-spend?months=6
  // Sums completed payment events linked to a money stream, per calendar month.
  // Events without a linked stream are excluded — there is no amount to attribute.
  app.get<{ Querystring: { months?: string } }>('/monthly-spend', async (req) => {
    const months = Math.min(Math.max(parseInt(req.query.months ?? '6', 10) || 6, 1), 24);
    const now = new Date();
    const since = windowStart(months, now);
    const { rows } = await query<{ month: string; total: string }>(
      `SELECT to_char(date_trunc('month', e.target_date), 'YYYY-MM') AS month,
              SUM(s.amount) AS total
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
};
