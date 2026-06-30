// Aggregates the four Katei domain routers under the /api prefix.

import type { FastifyPluginAsync } from 'fastify';
import { usersRoutes } from './users.js';
import { moneyStreamsRoutes } from './money-streams.js';
import { eventsRoutes } from './events.js';
import { assignmentsRoutes } from './assignments.js';
import { analyticsRoutes } from './analytics.js';
import { invitesRoutes } from './invites.js';

export const apiRoutes: FastifyPluginAsync = async (app) => {
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(moneyStreamsRoutes, { prefix: '/money-streams' });
  await app.register(eventsRoutes, { prefix: '/events' });
  await app.register(assignmentsRoutes, { prefix: '/assignments' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(invitesRoutes, { prefix: '/invites' });
};
