/**
 * Fastify in-process server. Bound to 127.0.0.1:0 (OS-assigned port) so it
 * never collides with anything else on the user's machine.
 *
 * Lifecycle:
 *   startServer() -> opens DB, runs migrations, registers routes, listens.
 *   .close()      -> closes Fastify (which closes the DB via the onClose hook).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import { openDatabase, type DbHandle } from './db/conexion';
import { runMigrations } from './db/migrador';
import { registerRoutes } from './rutas/index';

export interface StartServerOptions {
  userDataPath: string;
}

export interface RunningServer {
  apiBase: string;
  port: number;
  close: () => Promise<void>;
}

export async function startServer(opts: StartServerOptions): Promise<RunningServer> {
  const logsDir = path.join(opts.userDataPath, 'registros');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'servidor.log');

  const app: FastifyInstance = Fastify({
    logger: {
      level: 'warn',
      file: logFile,
    },
    disableRequestLogging: true,
  });

  // Open DB and run migrations BEFORE registering routes that depend on it.
  const { db, raw } = openDatabase({ userDataPath: opts.userDataPath });
  await runMigrations(db);

  // Make the DB available to every route via app.db.
  app.decorate('db', db);
  app.decorate('userDataPath', opts.userDataPath);

  // Close the DB when Fastify shuts down.
  app.addHook('onClose', async () => {
    await db.destroy();
    raw.close();
  });

  // Renderer is loaded via file:// so its Origin is "null" — allow it.
  await app.register(cors, { origin: true, credentials: false });

  // Multipart uploads (CSV import). 25 MB cap, single file.
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  // Routes (asientos, importar, exportar, liquidación, pin, etc).
  await registerRoutes(app);

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No se pudo determinar el puerto del servidor.');
  }
  const port = address.port;
  const apiBase = `http://127.0.0.1:${port}`;

  return {
    apiBase,
    port,
    close: async () => {
      await app.close();
    },
  };
}

// Decorations for TS.
declare module 'fastify' {
  interface FastifyInstance {
    db: DbHandle;
    userDataPath: string;
  }
}
