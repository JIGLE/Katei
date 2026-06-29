// Module augmentations for the auth layer.

import '@fastify/jwt';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; name: string };
    user: { id: number; name: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    // preHandler/onRequest guard that 401s unauthenticated requests.
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
