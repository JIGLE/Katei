// POST /api/link-preview — fetch a pasted URL and return its title/site for
// gift items and savings-goal links. Guarded against SSRF (public addresses
// only), time- and size-capped, and rate-limited per user: parsing is a
// convenience, never a proxy.

import type { FastifyPluginAsync } from 'fastify';
import { assertFetchableUrl, fetchLinkMeta } from '../lib/linkmeta.js';
import { hit } from '../lib/ratelimit.js';

export const linkPreviewRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { url: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: { url: { type: 'string', minLength: 1, maxLength: 2000 } },
        },
      },
    },
    async (req, reply) => {
      const rl = hit(`preview:${req.user?.id ?? 'anon'}`, 30, 10 * 60 * 1000);
      if (!rl.ok) {
        reply.header('Retry-After', String(rl.retryAfterSec));
        return reply.code(429).send({ error: 'Too many previews — try again shortly.' });
      }
      let url;
      try {
        url = await assertFetchableUrl(req.body.url.trim());
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Not a valid link' });
      }
      const meta = await fetchLinkMeta(url);
      return { url: url.toString(), title: meta.title, site: meta.site };
    },
  );
};
