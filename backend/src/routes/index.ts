// Aggregates the four Katei domain routers under the /api prefix.

import type { FastifyPluginAsync } from 'fastify';
import { usersRoutes } from './users.js';
import { moneyStreamsRoutes } from './money-streams.js';
import { eventsRoutes } from './events.js';
import { assignmentsRoutes } from './assignments.js';
import { analyticsRoutes } from './analytics.js';
import { invitesRoutes } from './invites.js';
import { activityRoutes } from './activity.js';
import { savingsRoutes } from './savings.js';
import { notificationsRoutes } from './notifications.js';
import { pushRoutes } from './push.js';

export const apiRoutes: FastifyPluginAsync = async (app) => {
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(moneyStreamsRoutes, { prefix: '/money-streams' });
  await app.register(eventsRoutes, { prefix: '/events' });
  await app.register(assignmentsRoutes, { prefix: '/assignments' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  await app.register(invitesRoutes, { prefix: '/invites' });
  await app.register(activityRoutes, { prefix: '/activity' });
  await app.register(savingsRoutes, { prefix: '/savings' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(pushRoutes, { prefix: '/push' });
};
