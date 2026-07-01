// Public iCalendar feed. Calendar apps subscribe by URL with no session, so
// this route is unauthenticated and gated by a per-household secret token
// (see settings.ts to fetch/rotate it). Mounted OUTSIDE the authenticated group.

import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';
import { buildICS, type CalEvent } from '../lib/calendar.js';

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/calendar/:token(.ics) — the household's upcoming + recent events.
  app.get<{ Params: { token: string } }>('/:token', async (req, reply) => {
    const token = req.params.token.replace(/\.ics$/, '');
    const saved = await getSetting('calendar_token');
    if (!saved || token !== saved) {
      return reply.code(404).send({ error: 'Calendar not found' });
    }
    const { rows } = await query<CalEvent>(
      `SELECT id, title, event_type, to_char(target_date, 'YYYY-MM-DD') AS target_date, description
         FROM household_events
        WHERE target_date >= CURRENT_DATE - INTERVAL '90 days'
        ORDER BY target_date ASC`,
    );
    reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', 'inline; filename="katei.ics"');
    return reply.send(buildICS(rows, { name: 'Katei 家庭' }));
  });
};
