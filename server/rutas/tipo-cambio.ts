/**
 * Tipo de cambio ARS / USD. Tabla singleton (id = 1).
 *   GET   /api/tipo-cambio
 *   PUT   /api/tipo-cambio   { ars_por_usd: number }
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

export const rutasTipoCambio: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/', async () => {
    const row = await app.db.selectFrom('tipo_cambio').selectAll().where('id', '=', 1).executeTakeFirst();
    return row ?? { id: 1, ars_por_usd: 0, actualizado_en: null };
  });

  app.put('/', async (req, reply) => {
    const parsed = z.object({ ars_por_usd: z.number().positive() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Valor inválido' });
    const ahora = new Date().toISOString();
    await app.db
      .updateTable('tipo_cambio')
      .set({ ars_por_usd: parsed.data.ars_por_usd, actualizado_en: ahora })
      .where('id', '=', 1)
      .execute();
    return { ok: true, ars_por_usd: parsed.data.ars_por_usd, actualizado_en: ahora };
  });
};
