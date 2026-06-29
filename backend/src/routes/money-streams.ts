// Money streams domain — fixed costs, utilities, subscriptions.
// Scaffolded for the next phase (core API data routers).

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const moneyStreamsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/money-streams — list recurring and one-off money streams.
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT id, name, amount, currency, is_recurring, frequency, category, created_at
       FROM money_streams
       ORDER BY created_at DESC`,
    );
    return rows;
  });

  // Further CRUD lands in the data-router phase.
};
