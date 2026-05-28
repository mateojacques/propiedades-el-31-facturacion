/**
 * Rutas REST de dueños:
 *   GET    /api/duenos              — listado con propiedades asociadas
 *   GET    /api/duenos/:id
 *   POST   /api/duenos              — alta (acepta fichas, auto-upsert)
 *   PATCH  /api/duenos/:id          — modificación (puede reemplazar propiedades)
 *   DELETE /api/duenos/:id          — baja (REJECT si referenciado por movimientos)
 *
 * Las propiedades se reciben como array de fichas (`["20-2026", "5-2025"]`).
 * Si una ficha no existe, se crea automáticamente.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fichaSchema } from '../servicios/validar-ficha';
import { duenoAFila, type DuenoPropiedadResumen } from '../servicios/duenos-util';

const altaSchema = z.object({
  nombre: z.string().trim().min(1),
  documento: z.string().trim().min(1).nullable().optional(),
  fichas: z.array(fichaSchema).default([]),
});
const editSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  documento: z.string().trim().nullable().optional(),
  fichas: z.array(fichaSchema).optional(),
});

async function cargarPropiedades(
  app: FastifyInstance,
  duenoIds: number[]
): Promise<Map<number, DuenoPropiedadResumen[]>> {
  const result = new Map<number, DuenoPropiedadResumen[]>();
  if (duenoIds.length === 0) return result;
  const filas = await app.db
    .selectFrom('dueno_propiedades as dp')
    .innerJoin('propiedades as p', 'p.id', 'dp.propiedad_id')
    .select(['dp.dueno_id as dueno_id', 'p.id as id', 'p.ficha as ficha'])
    .where('dp.dueno_id', 'in', duenoIds)
    .orderBy('p.ficha', 'asc')
    .execute();
  for (const f of filas) {
    const arr = result.get(f.dueno_id) ?? [];
    arr.push({ id: f.id, ficha: f.ficha });
    result.set(f.dueno_id, arr);
  }
  return result;
}

/**
 * Upsert de propiedades por ficha dentro de una transacción.
 * Devuelve los IDs en el mismo orden que las fichas de entrada.
 */
async function upsertPropiedadesEnTrx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: any,
  fichas: string[]
): Promise<number[]> {
  if (fichas.length === 0) return [];
  const ahora = new Date().toISOString();
  // Quitar duplicados manteniendo orden.
  const unicas = Array.from(new Set(fichas));
  const existentes = await trx
    .selectFrom('propiedades')
    .select(['id', 'ficha'])
    .where('ficha', 'in', unicas)
    .execute();
  const mapa = new Map<string, number>();
  for (const f of existentes as Array<{ id: number; ficha: string }>) {
    mapa.set(f.ficha, f.id);
  }
  const faltantes = unicas.filter((f) => !mapa.has(f));
  if (faltantes.length > 0) {
    const insertados = await trx
      .insertInto('propiedades')
      .values(faltantes.map((f) => ({ ficha: f, creado_en: ahora, actualizado_en: ahora })))
      .returning(['id', 'ficha'])
      .execute();
    for (const f of insertados as Array<{ id: number; ficha: string }>) {
      mapa.set(f.ficha, f.id);
    }
  }
  return fichas.map((f) => mapa.get(f)!);
}

export const rutasDuenos: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── LIST ────────────────────────────────────────────────────────────────
  app.get('/', async (req) => {
    const q = z.object({ q: z.string().optional() }).safeParse(req.query);
    const filtro = q.success ? q.data.q?.trim() : undefined;

    let qb = app.db.selectFrom('duenos').selectAll().orderBy('nombre', 'asc');
    if (filtro) qb = qb.where('nombre', 'like', `%${filtro}%`);
    const filas = await qb.execute();
    const ids = filas.map((d) => d.id);
    const mapa = await cargarPropiedades(app, ids);
    return filas.map((d) => duenoAFila(d, mapa.get(d.id) ?? []));
  });

  // ── GET ONE ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const fila = await app.db.selectFrom('duenos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!fila) return reply.code(404).send({ error: 'Dueño no encontrado' });
    const mapa = await cargarPropiedades(app, [id]);
    return duenoAFila(fila, mapa.get(id) ?? []);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = altaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    const d = parsed.data;
    const documento = d.documento && d.documento.length > 0 ? d.documento : null;

    if (documento) {
      const dup = await app.db
        .selectFrom('duenos')
        .select('id')
        .where('documento', '=', documento)
        .executeTakeFirst();
      if (dup) return reply.code(409).send({ error: 'Ya existe un dueño con ese documento' });
    }

    try {
      const result = await app.db.transaction().execute(async (trx) => {
        const ahora = new Date().toISOString();
        const ins = await trx
          .insertInto('duenos')
          .values({ nombre: d.nombre, documento, creado_en: ahora, actualizado_en: ahora })
          .returningAll()
          .executeTakeFirstOrThrow();
        const propIds = await upsertPropiedadesEnTrx(trx, d.fichas);
        if (propIds.length > 0) {
          await trx
            .insertInto('dueno_propiedades')
            .values(propIds.map((pid) => ({ dueno_id: ins.id, propiedad_id: pid })))
            .execute();
        }
        return ins;
      });
      const mapa = await cargarPropiedades(app, [result.id]);
      return reply.code(201).send(duenoAFila(result, mapa.get(result.id) ?? []));
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message });
    }
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const d = parsed.data;

    const prev = await app.db.selectFrom('duenos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) return reply.code(404).send({ error: 'Dueño no encontrado' });

    // Documento único cuando presente.
    if ('documento' in d && d.documento !== undefined) {
      const nuevoDoc = d.documento && d.documento.length > 0 ? d.documento : null;
      if (nuevoDoc && nuevoDoc !== prev.documento) {
        const dup = await app.db
          .selectFrom('duenos')
          .select('id')
          .where('documento', '=', nuevoDoc)
          .where('id', '!=', id)
          .executeTakeFirst();
        if (dup) return reply.code(409).send({ error: 'Ya existe un dueño con ese documento' });
      }
    }

    await app.db.transaction().execute(async (trx) => {
      const sets: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
      if (d.nombre !== undefined) sets.nombre = d.nombre;
      if ('documento' in d && d.documento !== undefined) {
        sets.documento = d.documento && d.documento.length > 0 ? d.documento : null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await trx.updateTable('duenos').set(sets as any).where('id', '=', id).execute();

      // Reemplazar el set de propiedades si vino `fichas`.
      if (d.fichas !== undefined) {
        await trx.deleteFrom('dueno_propiedades').where('dueno_id', '=', id).execute();
        const propIds = await upsertPropiedadesEnTrx(trx, d.fichas);
        if (propIds.length > 0) {
          await trx
            .insertInto('dueno_propiedades')
            .values(propIds.map((pid) => ({ dueno_id: id, propiedad_id: pid })))
            .execute();
        }
      }
    });

    const final = await app.db.selectFrom('duenos').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    const mapa = await cargarPropiedades(app, [id]);
    return duenoAFila(final, mapa.get(id) ?? []);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });

    const refMov = await app.db
      .selectFrom('movimientos')
      .select((eb) => eb.fn.count<number>('id').as('n'))
      .where('dueno_id', '=', id)
      .executeTakeFirst();
    const nMov = Number(refMov?.n ?? 0);
    if (nMov > 0) {
      return reply.code(409).send({
        error: 'No se puede eliminar el dueño porque tiene movimientos asociados',
        referenciado_por_movimientos: nMov,
      });
    }

    // El vínculo dueno_propiedades cae por ON DELETE CASCADE.
    const r = await app.db.deleteFrom('duenos').where('id', '=', id).executeTakeFirst();
    if (Number(r.numDeletedRows ?? 0) === 0) return reply.code(404).send({ error: 'Dueño no encontrado' });
    return { ok: true };
  });
};
