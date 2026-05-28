/**
 * Rutas REST de propiedades:
 *   GET    /api/propiedades          — listado (con conteo de dueños asociados)
 *   GET    /api/propiedades/:id
 *   POST   /api/propiedades          — alta
 *   PATCH  /api/propiedades/:id      — modificación
 *   DELETE /api/propiedades/:id      — baja (REJECT si referenciada)
 *
 * El borrado verifica que no haya movimientos ni inquilinos asociados;
 * en caso contrario responde 409 con un payload descriptivo.
 *
 * La M:N con dueños se administra desde rutas de dueños (POST/DELETE
 * vínculo). Aquí solo se devuelve `duenos_ids` enriquecido para conveniencia.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fichaSchema } from '../servicios/validar-ficha';
import { propiedadAFila } from '../servicios/propiedades-util';

const altaSchema = z.object({ ficha: fichaSchema });
const editSchema = z.object({ ficha: fichaSchema.optional() });

async function cargarDuenosIds(
  app: FastifyInstance,
  propiedadIds: number[]
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (propiedadIds.length === 0) return result;
  const filas = await app.db
    .selectFrom('dueno_propiedades')
    .select(['propiedad_id', 'dueno_id'])
    .where('propiedad_id', 'in', propiedadIds)
    .execute();
  for (const f of filas) {
    const arr = result.get(f.propiedad_id) ?? [];
    arr.push(f.dueno_id);
    result.set(f.propiedad_id, arr);
  }
  return result;
}

export const rutasPropiedades: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── LIST ────────────────────────────────────────────────────────────────
  app.get('/', async (req) => {
    const q = z
      .object({ q: z.string().optional() })
      .safeParse(req.query);
    const filtro = q.success ? q.data.q : undefined;

    let qb = app.db.selectFrom('propiedades').selectAll().orderBy('ficha', 'asc');
    if (filtro) qb = qb.where('ficha', 'like', `%${filtro}%`);

    const filas = await qb.execute();
    const ids = filas.map((p) => p.id);
    const mapaDuenos = await cargarDuenosIds(app, ids);
    return filas.map((p) => propiedadAFila(p, mapaDuenos.get(p.id) ?? []));
  });

  // ── GET ONE ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const fila = await app.db.selectFrom('propiedades').selectAll().where('id', '=', id).executeTakeFirst();
    if (!fila) return reply.code(404).send({ error: 'Propiedad no encontrada' });
    const mapa = await cargarDuenosIds(app, [id]);
    return propiedadAFila(fila, mapa.get(id) ?? []);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = altaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    // Duplicado por ficha.
    const yaExiste = await app.db
      .selectFrom('propiedades')
      .select('id')
      .where('ficha', '=', parsed.data.ficha)
      .executeTakeFirst();
    if (yaExiste) {
      return reply.code(409).send({ error: 'Ya existe una propiedad con esa ficha' });
    }
    const ahora = new Date().toISOString();
    const ins = await app.db
      .insertInto('propiedades')
      .values({ ficha: parsed.data.ficha, creado_en: ahora, actualizado_en: ahora })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reply.code(201).send(propiedadAFila(ins, []));
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos inválidos' });

    const prev = await app.db.selectFrom('propiedades').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) return reply.code(404).send({ error: 'Propiedad no encontrada' });

    if (parsed.data.ficha && parsed.data.ficha !== prev.ficha) {
      const colisiona = await app.db
        .selectFrom('propiedades')
        .select('id')
        .where('ficha', '=', parsed.data.ficha)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (colisiona) return reply.code(409).send({ error: 'Ya existe una propiedad con esa ficha' });
    }

    await app.db
      .updateTable('propiedades')
      .set({
        ficha: parsed.data.ficha ?? prev.ficha,
        actualizado_en: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();

    const final = await app.db.selectFrom('propiedades').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    const mapa = await cargarDuenosIds(app, [id]);
    return propiedadAFila(final, mapa.get(id) ?? []);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });

    // Verificar referencias antes de borrar.
    const refMov = await app.db
      .selectFrom('movimientos')
      .select((eb) => eb.fn.count<number>('id').as('n'))
      .where('propiedad_id', '=', id)
      .executeTakeFirst();
    const refInq = await app.db
      .selectFrom('inquilinos')
      .select((eb) => eb.fn.count<number>('id').as('n'))
      .where('propiedad_id', '=', id)
      .executeTakeFirst();
    const nMov = Number(refMov?.n ?? 0);
    const nInq = Number(refInq?.n ?? 0);
    if (nMov > 0 || nInq > 0) {
      return reply.code(409).send({
        error: 'No se puede eliminar la propiedad porque tiene referencias',
        referenciado_por_movimientos: nMov,
        referenciado_por_inquilinos: nInq,
      });
    }

    // El vínculo dueno_propiedades cae por ON DELETE CASCADE.
    const r = await app.db.deleteFrom('propiedades').where('id', '=', id).executeTakeFirst();
    if (Number(r.numDeletedRows ?? 0) === 0) return reply.code(404).send({ error: 'Propiedad no encontrada' });
    return { ok: true };
  });
};
