/**
 * PIN routes: estado (¿hay PIN configurado?), establecer (crear/cambiar),
 * verificar (login). 4 dígitos numéricos, bcryptjs cost 12, no lockout.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const CLAVE_PIN = 'pin_hash';
const PIN_REGEX = /^\d{4}$/;
const COST_FACTOR = 12;

const pinSchema = z.object({ pin: z.string().regex(PIN_REGEX) });
const cambioSchema = z.object({
  pinActual: z.string().regex(PIN_REGEX).optional(),
  pinNuevo: z.string().regex(PIN_REGEX),
});

async function leerHash(app: FastifyInstance): Promise<string | null> {
  const fila = await app.db
    .selectFrom('configuracion')
    .select('valor')
    .where('clave', '=', CLAVE_PIN)
    .executeTakeFirst();
  return fila?.valor ?? null;
}

async function escribirHash(app: FastifyInstance, hash: string): Promise<void> {
  const ahora = new Date().toISOString();
  await app.db
    .insertInto('configuracion')
    .values({ clave: CLAVE_PIN, valor: hash, actualizado_en: ahora })
    .onConflict((oc) =>
      oc.column('clave').doUpdateSet({ valor: hash, actualizado_en: ahora })
    )
    .execute();
}

export const rutasPin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/pin/estado → { configurado: boolean }
  app.get('/estado', async () => {
    const hash = await leerHash(app);
    return { configurado: hash !== null };
  });

  // POST /api/pin/verificar { pin }
  app.post('/verificar', async (req, reply) => {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'PIN inválido' });
    }
    const hash = await leerHash(app);
    if (!hash) return reply.code(400).send({ error: 'PIN no configurado' });
    const ok = await bcrypt.compare(parsed.data.pin, hash);
    return { ok };
  });

  // POST /api/pin/cambiar { pinActual?, pinNuevo }
  // Si no hay PIN configurado, pinActual no se requiere (primer arranque).
  app.post('/cambiar', async (req, reply) => {
    const parsed = cambioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos' });
    }
    const hashActual = await leerHash(app);
    if (hashActual) {
      if (!parsed.data.pinActual) {
        return reply.code(400).send({ error: 'Se requiere el PIN actual' });
      }
      const ok = await bcrypt.compare(parsed.data.pinActual, hashActual);
      if (!ok) return reply.code(401).send({ error: 'PIN actual incorrecto' });
    }
    const nuevoHash = await bcrypt.hash(parsed.data.pinNuevo, COST_FACTOR);
    await escribirHash(app, nuevoHash);
    return { ok: true };
  });
};
