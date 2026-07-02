// Serve uploaded member avatars. Mounted inside the authenticated group, so a
// same-origin <img src="/api/avatars/…"> (which sends the session cookie) works
// while the files aren't exposed publicly.

import type { FastifyPluginAsync } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { avatarPath } from '../lib/avatars.js';

export const avatarsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { file: string } }>('/:file', async (req, reply) => {
    const full = avatarPath(req.params.file);
    if (!full) return reply.code(400).send({ error: 'Invalid avatar name' });
    if (!existsSync(full)) return reply.code(404).send({ error: 'Avatar not found' });
    const type = req.params.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    reply.header('Content-Type', type).header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(createReadStream(full));
  });
};
