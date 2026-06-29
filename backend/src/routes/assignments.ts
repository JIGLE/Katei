// Assignments domain — maps users to events and money streams.
// Scaffolded for the next phase (core API data routers).

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const assignmentsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/assignments — list operational assignments.
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT id, user_id, event_id, money_stream_id, role
       FROM assignments
       ORDER BY id ASC`,
    );
    return rows;
  });

  // Further CRUD lands in the data-router phase.
};
