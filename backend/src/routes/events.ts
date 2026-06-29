// Household events domain — deadlines, payments, appointments.
// Scaffolded for the next phase (core API data routers).

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/events — chronological stream of upcoming household events.
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT id, title, description, event_type, target_date, is_completed,
              money_stream_id, created_at
       FROM household_events
       ORDER BY target_date ASC`,
    );
    return rows;
  });

  // Further CRUD lands in the data-router phase.
};
