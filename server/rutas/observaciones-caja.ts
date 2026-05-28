/**
 * Observaciones de caja:
 *   GET    /api/observaciones-caja?anio&mes   — devuelve la observación del mes (o null)
 *   PUT    /api/observaciones-caja            — crea o actualiza (upsert por anio+mes)
 *   DELETE /api/observaciones-caja?anio&mes   — borra la observación del mes
 *
 * Modelo: el administrador marca, para un mes específico, si la caja
 * tiene "sobrante" o "faltante" con un monto observado y una nota libre.
 * Una sola observación por (anio, mes) — UNIQUE constraint en DB.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const periodoQuerySchema = z.object({
  anio: z.coerce.number().int().min(1900).max(3000),
  mes: z.coerce.number().int().min(1).max(12),
});

const upsertSchema = z.object({
  anio: z.number().int().min(1900).max(3000),
  mes: z.number().int().min(1).max(12),
  tipo: z.enum(['sobrante', 'faltante']),
  monto_centavos: z.number().int().min(0),
  nota: z.string().nullable().optional(),
});

export const rutasObservacionesCaja: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── GET (por período) ──────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const parsed = periodoQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const { anio, mes } = parsed.data;
    const fila = await app.db
      .selectFrom('observaciones_caja')
      .selectAll()
      .where('anio', '=', anio)
      .where('mes', '=', mes)
      .executeTakeFirst();
    return fila ?? null;
  });

  // ── PUT (upsert) ───────────────────────────────────────────────────────
  app.put('/', async (req, reply) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    const d = parsed.data;
    const ahora = new Date().toISOString();

    const fila = await app.db.transaction().execute(async (trx) => {
      const existente = await trx
        .selectFrom('observaciones_caja')
        .selectAll()
        .where('anio', '=', d.anio)
        .where('mes', '=', d.mes)
        .executeTakeFirst();

      if (existente) {
        await trx
          .updateTable('observaciones_caja')
          .set({
            tipo: d.tipo,
            monto_centavos: d.monto_centavos,
            nota: d.nota ?? null,
            actualizado_en: ahora,
          })
          .where('id', '=', existente.id)
          .execute();
        return trx
          .selectFrom('observaciones_caja')
          .selectAll()
          .where('id', '=', existente.id)
          .executeTakeFirstOrThrow();
      }

      return trx
        .insertInto('observaciones_caja')
        .values({
          anio: d.anio,
          mes: d.mes,
          tipo: d.tipo,
          monto_centavos: d.monto_centavos,
          nota: d.nota ?? null,
          creado_en: ahora,
          actualizado_en: ahora,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    return fila;
  });

  // ── DELETE (por período) ───────────────────────────────────────────────
  app.delete('/', async (req, reply) => {
    const parsed = periodoQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const { anio, mes } = parsed.data;
    const r = await app.db
      .deleteFrom('observaciones_caja')
      .where('anio', '=', anio)
      .where('mes', '=', mes)
      .executeTakeFirst();
    return { borrados: Number(r.numDeletedRows ?? 0) };
  });
};
