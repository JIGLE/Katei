// Household users domain.
// Scaffolded for the next phase (core API data routers).

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/users — list household members.
  app.get('/', async () => {
    const { rows } = await query(
      'SELECT id, name, avatar_url, created_at FROM users ORDER BY created_at ASC',
    );
    return rows;
  });

  // Further CRUD (POST/PATCH/DELETE) lands in the data-router phase.
};
