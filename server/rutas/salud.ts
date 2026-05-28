/**
 * Health check route. Useful for the renderer to confirm the server is
 * reachable on first paint, and for Wine smoke tests.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const rutasSalud: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/salud', async () => ({
    ok: true,
    version: process.env.npm_package_version ?? '0.0.0',
    fechaHora: new Date().toISOString(),
  }));
};
