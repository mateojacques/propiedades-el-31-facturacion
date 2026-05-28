/**
 * Rutas REST de inquilinos:
 *   GET    /api/inquilinos              — listado (filtrable por propiedad_id)
 *   GET    /api/inquilinos/:id
 *   POST   /api/inquilinos              — alta (acepta `ficha` para upsert)
 *   PATCH  /api/inquilinos/:id          — modificación
 *   DELETE /api/inquilinos/:id          — baja (REJECT si referenciado por mov.)
 *
 * El payload de alta/edit acepta o bien `propiedad_id` (si la propiedad ya
 * existe y la conocemos), o bien `ficha` (auto-upsert de la propiedad).
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fichaSchema } from '../servicios/validar-ficha';
import { inquilinoAFila } from '../servicios/inquilinos-util';

const propRefSchema = z.union([
  z.object({ propiedad_id: z.number().int().positive(), ficha: z.never().optional() }),
  z.object({ ficha: fichaSchema, propiedad_id: z.never().optional() }),
]);

const altaSchema = z
  .object({
    nombre: z.string().trim().min(1),
    documento: z.string().trim().min(1).nullable().optional(),
  })
  .and(propRefSchema);

const editSchema = z
  .object({
    nombre: z.string().trim().min(1).optional(),
    documento: z.string().trim().nullable().optional(),
    propiedad_id: z.number().int().positive().optional(),
    ficha: fichaSchema.optional(),
  })
  // Si vienen los dos, ficha gana? Mejor explicitar: aceptamos solo uno.
  .refine((v) => !(v.propiedad_id !== undefined && v.ficha !== undefined), {
    message: 'Use propiedad_id O ficha, no ambos',
  });

async function upsertPropiedadPorFicha(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: any,
  ficha: string
): Promise<number> {
  const existente = await trx
    .selectFrom('propiedades')
    .select('id')
    .where('ficha', '=', ficha)
    .executeTakeFirst();
  if (existente) return (existente as { id: number }).id;
  const ahora = new Date().toISOString();
  const ins = await trx
    .insertInto('propiedades')
    .values({ ficha, creado_en: ahora, actualizado_en: ahora })
    .returning('id')
    .executeTakeFirstOrThrow();
  return (ins as { id: number }).id;
}

export const rutasInquilinos: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── LIST ────────────────────────────────────────────────────────────────
  app.get('/', async (req) => {
    const q = z
      .object({
        q: z.string().optional(),
        propiedad_id: z.coerce.number().int().optional(),
      })
      .safeParse(req.query);
    const filtro = q.success ? q.data.q?.trim() : undefined;
    const propId = q.success ? q.data.propiedad_id : undefined;

    let qb = app.db
      .selectFrom('inquilinos as i')
      .innerJoin('propiedades as p', 'p.id', 'i.propiedad_id')
      .select([
        'i.id as id',
        'i.nombre as nombre',
        'i.documento as documento',
        'i.propiedad_id as propiedad_id',
        'i.creado_en as creado_en',
        'i.actualizado_en as actualizado_en',
        'p.ficha as propiedad_ficha',
      ])
      .orderBy('i.nombre', 'asc');
    if (filtro) qb = qb.where('i.nombre', 'like', `%${filtro}%`);
    if (propId !== undefined) qb = qb.where('i.propiedad_id', '=', propId);

    const filas = await qb.execute();
    return filas.map((f) =>
      inquilinoAFila(
        {
          id: f.id,
          nombre: f.nombre,
          documento: f.documento,
          propiedad_id: f.propiedad_id,
          creado_en: f.creado_en,
          actualizado_en: f.actualizado_en,
        },
        f.propiedad_ficha
      )
    );
  });

  // ── GET ONE ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const fila = await app.db
      .selectFrom('inquilinos as i')
      .innerJoin('propiedades as p', 'p.id', 'i.propiedad_id')
      .select([
        'i.id as id',
        'i.nombre as nombre',
        'i.documento as documento',
        'i.propiedad_id as propiedad_id',
        'i.creado_en as creado_en',
        'i.actualizado_en as actualizado_en',
        'p.ficha as propiedad_ficha',
      ])
      .where('i.id', '=', id)
      .executeTakeFirst();
    if (!fila) return reply.code(404).send({ error: 'Inquilino no encontrado' });
    return inquilinoAFila(
      {
        id: fila.id,
        nombre: fila.nombre,
        documento: fila.documento,
        propiedad_id: fila.propiedad_id,
        creado_en: fila.creado_en,
        actualizado_en: fila.actualizado_en,
      },
      fila.propiedad_ficha
    );
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
        .selectFrom('inquilinos')
        .select('id')
        .where('documento', '=', documento)
        .executeTakeFirst();
      if (dup) return reply.code(409).send({ error: 'Ya existe un inquilino con ese documento' });
    }

    try {
      const { ins, ficha } = await app.db.transaction().execute(async (trx) => {
        let propiedadId: number;
        if ('propiedad_id' in d && d.propiedad_id !== undefined) {
          propiedadId = d.propiedad_id;
          // Validar que exista.
          const p = await trx
            .selectFrom('propiedades')
            .select('id')
            .where('id', '=', propiedadId)
            .executeTakeFirst();
          if (!p) throw new Error('propiedad_id inexistente');
        } else if ('ficha' in d && d.ficha !== undefined) {
          propiedadId = await upsertPropiedadPorFicha(trx, d.ficha);
        } else {
          throw new Error('Debe indicar propiedad_id o ficha');
        }
        const ahora = new Date().toISOString();
        const ins = await trx
          .insertInto('inquilinos')
          .values({
            nombre: d.nombre,
            documento,
            propiedad_id: propiedadId,
            creado_en: ahora,
            actualizado_en: ahora,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const p = await trx
          .selectFrom('propiedades')
          .select('ficha')
          .where('id', '=', propiedadId)
          .executeTakeFirstOrThrow();
        return { ins, ficha: (p as { ficha: string }).ficha };
      });
      return reply.code(201).send(inquilinoAFila(ins, ficha));
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const d = parsed.data;

    const prev = await app.db.selectFrom('inquilinos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) return reply.code(404).send({ error: 'Inquilino no encontrado' });

    if ('documento' in d && d.documento !== undefined) {
      const nuevoDoc = d.documento && d.documento.length > 0 ? d.documento : null;
      if (nuevoDoc && nuevoDoc !== prev.documento) {
        const dup = await app.db
          .selectFrom('inquilinos')
          .select('id')
          .where('documento', '=', nuevoDoc)
          .where('id', '!=', id)
          .executeTakeFirst();
        if (dup) return reply.code(409).send({ error: 'Ya existe un inquilino con ese documento' });
      }
    }

    try {
      const fichaFinal = await app.db.transaction().execute(async (trx) => {
        let propiedadId: number = prev.propiedad_id;
        if (d.propiedad_id !== undefined) {
          const p = await trx
            .selectFrom('propiedades')
            .select('id')
            .where('id', '=', d.propiedad_id)
            .executeTakeFirst();
          if (!p) throw new Error('propiedad_id inexistente');
          propiedadId = d.propiedad_id;
        } else if (d.ficha !== undefined) {
          propiedadId = await upsertPropiedadPorFicha(trx, d.ficha);
        }
        const sets: Record<string, unknown> = {
          actualizado_en: new Date().toISOString(),
          propiedad_id: propiedadId,
        };
        if (d.nombre !== undefined) sets.nombre = d.nombre;
        if ('documento' in d && d.documento !== undefined) {
          sets.documento = d.documento && d.documento.length > 0 ? d.documento : null;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await trx.updateTable('inquilinos').set(sets as any).where('id', '=', id).execute();
        const p = await trx
          .selectFrom('propiedades')
          .select('ficha')
          .where('id', '=', propiedadId)
          .executeTakeFirstOrThrow();
        return (p as { ficha: string }).ficha;
      });

      const final = await app.db.selectFrom('inquilinos').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
      return inquilinoAFila(final, fichaFinal);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });

    const refMov = await app.db
      .selectFrom('movimientos')
      .select((eb) => eb.fn.count<number>('id').as('n'))
      .where('inquilino_id', '=', id)
      .executeTakeFirst();
    const nMov = Number(refMov?.n ?? 0);
    if (nMov > 0) {
      return reply.code(409).send({
        error: 'No se puede eliminar el inquilino porque tiene movimientos asociados',
        referenciado_por_movimientos: nMov,
      });
    }

    const r = await app.db.deleteFrom('inquilinos').where('id', '=', id).executeTakeFirst();
    if (Number(r.numDeletedRows ?? 0) === 0) return reply.code(404).send({ error: 'Inquilino no encontrado' });
    return { ok: true };
  });
};
