/**
 * Rutas REST de movimientos:
 *   GET    /api/movimientos              — listado con filtros por IDs y paginado
 *   GET    /api/movimientos/balance      — balance del período (entradas − salidas)
 *   GET    /api/movimientos/:id
 *   POST   /api/movimientos              — alta
 *   PATCH  /api/movimientos/:id          — modificación
 *   DELETE /api/movimientos/:id          — baja
 *   POST   /api/movimientos/:id/corregir — crea un movimiento de signo invertido
 *                                          referenciando al original
 *   POST   /api/movimientos/limpiar      — borrado masivo por período/dueno_id
 *
 * Las consultas LEFT JOIN a duenos/inquilinos/propiedades para devolver
 * los nombres ya resueltos junto con los IDs (evita llamadas extra de la UI).
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { movimientoAFila } from '../servicios/movimientos-util';

const nuevoMovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(['entrada', 'salida']),
  monto_centavos: z.number().int().positive(),
  dueno_id: z.number().int().positive().nullable().optional(),
  inquilino_id: z.number().int().positive().nullable().optional(),
  propiedad_id: z.number().int().positive().nullable().optional(),
  concepto: z.string().default(''),
  detalle: z.string().nullable().optional(),
  pagos_de_meses: z.array(z.object({ anio: z.number().int(), mes: z.number().int() })).optional(),
  mes_facturacion_id: z.number().int().nullable().optional(),
  movimiento_original_id: z.number().int().nullable().optional(),
  extras: z.record(z.unknown()).nullable().optional(),
});

const filtroListaSchema = z.object({
  anio: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().optional(),
  dueno_id: z.coerce.number().int().optional(),
  inquilino_id: z.coerce.number().int().optional(),
  propiedad_id: z.coerce.number().int().optional(),
  tipo: z.enum(['entrada', 'salida']).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(500).default(100),
});

const filtroBalanceSchema = z.object({
  anio: z.coerce.number().int().min(1900).max(3000),
  mes: z.coerce.number().int().min(1).max(12),
  dueno_id: z.coerce.number().int().optional(),
});

function periodoDeFecha(fechaIso: string): { anio: number; mes: number } {
  const [y, m] = fechaIso.split('-');
  return { anio: parseInt(y!, 10), mes: parseInt(m!, 10) };
}

/**
 * Builder con LEFT JOIN para enriquecer movimientos con nombres.
 * Devuelve filas que cumplen `MovimientoConJoins` (campos extra _nombre/_ficha).
 */
function selectMovimientosEnriquecidos(app: FastifyInstance) {
  return app.db
    .selectFrom('movimientos as m')
    .leftJoin('duenos as d', 'd.id', 'm.dueno_id')
    .leftJoin('inquilinos as i', 'i.id', 'm.inquilino_id')
    .leftJoin('propiedades as p', 'p.id', 'm.propiedad_id')
    .select([
      'm.id as id',
      'm.fecha as fecha',
      'm.anio as anio',
      'm.mes as mes',
      'm.tipo as tipo',
      'm.monto_centavos as monto_centavos',
      'm.dueno_id as dueno_id',
      'm.inquilino_id as inquilino_id',
      'm.propiedad_id as propiedad_id',
      'm.concepto as concepto',
      'm.detalle as detalle',
      'm.pagos_de_meses as pagos_de_meses',
      'm.mes_facturacion_id as mes_facturacion_id',
      'm.movimiento_original_id as movimiento_original_id',
      'm.extras as extras',
      'm.creado_en as creado_en',
      'm.actualizado_en as actualizado_en',
      'd.nombre as dueno_nombre',
      'i.nombre as inquilino_nombre',
      'p.ficha as propiedad_ficha',
    ]);
}

export const rutasMovimientos: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── LIST ────────────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const parsed = filtroListaSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;

    let qb = selectMovimientosEnriquecidos(app);
    if (f.anio !== undefined) qb = qb.where('m.anio', '=', f.anio);
    if (f.mes !== undefined) qb = qb.where('m.mes', '=', f.mes);
    if (f.dueno_id !== undefined) qb = qb.where('m.dueno_id', '=', f.dueno_id);
    if (f.inquilino_id !== undefined) qb = qb.where('m.inquilino_id', '=', f.inquilino_id);
    if (f.propiedad_id !== undefined) qb = qb.where('m.propiedad_id', '=', f.propiedad_id);
    if (f.tipo) qb = qb.where('m.tipo', '=', f.tipo);
    if (f.desde) qb = qb.where('m.fecha', '>=', f.desde);
    if (f.hasta) qb = qb.where('m.fecha', '<=', f.hasta);

    // Conteo total (sin paginar).
    let qbCount = app.db
      .selectFrom('movimientos as m')
      .select((eb) => eb.fn.count<number>('m.id').as('n'));
    if (f.anio !== undefined) qbCount = qbCount.where('m.anio', '=', f.anio);
    if (f.mes !== undefined) qbCount = qbCount.where('m.mes', '=', f.mes);
    if (f.dueno_id !== undefined) qbCount = qbCount.where('m.dueno_id', '=', f.dueno_id);
    if (f.inquilino_id !== undefined) qbCount = qbCount.where('m.inquilino_id', '=', f.inquilino_id);
    if (f.propiedad_id !== undefined) qbCount = qbCount.where('m.propiedad_id', '=', f.propiedad_id);
    if (f.tipo) qbCount = qbCount.where('m.tipo', '=', f.tipo);
    if (f.desde) qbCount = qbCount.where('m.fecha', '>=', f.desde);
    if (f.hasta) qbCount = qbCount.where('m.fecha', '<=', f.hasta);
    const totalRow = await qbCount.executeTakeFirst();
    const total = Number(totalRow?.n ?? 0);

    const pagina = await qb
      .orderBy('m.fecha', 'desc')
      .orderBy('m.id', 'desc')
      .limit(f.por_pagina)
      .offset((f.pagina - 1) * f.por_pagina)
      .execute();

    return {
      data: pagina.map(movimientoAFila),
      paginacion: {
        pagina: f.pagina,
        por_pagina: f.por_pagina,
        total,
        paginas: Math.max(1, Math.ceil(total / f.por_pagina)),
      },
    };
  });

  // ── BALANCE ─────────────────────────────────────────────────────────────
  app.get('/balance', async (req, reply) => {
    const parsed = filtroBalanceSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;

    const filas = await app.db
      .selectFrom('movimientos')
      .select([
        sql<number>`COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN monto_centavos ELSE 0 END), 0)`.as('total_entradas'),
        sql<number>`COALESCE(SUM(CASE WHEN tipo = 'salida' THEN monto_centavos ELSE 0 END), 0)`.as('total_salidas'),
        app.db.fn.count<number>('id').as('cantidad'),
      ])
      .where('anio', '=', f.anio)
      .where('mes', '=', f.mes)
      .$if(f.dueno_id !== undefined, (qb) => qb.where('dueno_id', '=', f.dueno_id!))
      .executeTakeFirst();

    const total_entradas_centavos = Number(filas?.total_entradas ?? 0);
    const total_salidas_centavos = Number(filas?.total_salidas ?? 0);
    return {
      anio: f.anio,
      mes: f.mes,
      total_entradas_centavos,
      total_salidas_centavos,
      balance_centavos: total_entradas_centavos - total_salidas_centavos,
      cantidad: Number(filas?.cantidad ?? 0),
    };
  });

  // ── GET ONE ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const fila = await selectMovimientosEnriquecidos(app).where('m.id', '=', id).executeTakeFirst();
    if (!fila) return reply.code(404).send({ error: 'Movimiento no encontrado' });
    return movimientoAFila(fila);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = nuevoMovimientoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Datos inválidos', detalles: parsed.error.issues });
    }
    const d = parsed.data;
    const { anio, mes } = periodoDeFecha(d.fecha);
    const ahora = new Date().toISOString();

    const insertado = await app.db
      .insertInto('movimientos')
      .values({
        fecha: d.fecha,
        anio,
        mes,
        tipo: d.tipo,
        monto_centavos: d.monto_centavos,
        dueno_id: d.dueno_id ?? null,
        inquilino_id: d.inquilino_id ?? null,
        propiedad_id: d.propiedad_id ?? null,
        concepto: d.concepto,
        detalle: d.detalle ?? null,
        pagos_de_meses: d.pagos_de_meses ? JSON.stringify(d.pagos_de_meses) : null,
        mes_facturacion_id: d.mes_facturacion_id ?? null,
        movimiento_original_id: d.movimiento_original_id ?? null,
        extras: d.extras ? JSON.stringify(d.extras) : null,
        creado_en: ahora,
        actualizado_en: ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const enriched = await selectMovimientosEnriquecidos(app).where('m.id', '=', insertado.id).executeTakeFirstOrThrow();
    return reply.code(201).send(movimientoAFila(enriched));
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const parsed = nuevoMovimientoSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const d = parsed.data;

    const prev = await app.db.selectFrom('movimientos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) return reply.code(404).send({ error: 'Movimiento no encontrado' });

    const sets: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
    if (d.fecha) {
      const { anio, mes } = periodoDeFecha(d.fecha);
      sets.fecha = d.fecha;
      sets.anio = anio;
      sets.mes = mes;
    }
    if (d.tipo !== undefined) sets.tipo = d.tipo;
    if (d.monto_centavos !== undefined) sets.monto_centavos = d.monto_centavos;
    if ('dueno_id' in d) sets.dueno_id = d.dueno_id ?? null;
    if ('inquilino_id' in d) sets.inquilino_id = d.inquilino_id ?? null;
    if ('propiedad_id' in d) sets.propiedad_id = d.propiedad_id ?? null;
    if (d.concepto !== undefined) sets.concepto = d.concepto;
    if ('detalle' in d) sets.detalle = d.detalle ?? null;
    if (d.pagos_de_meses) sets.pagos_de_meses = JSON.stringify(d.pagos_de_meses);
    if ('mes_facturacion_id' in d) sets.mes_facturacion_id = d.mes_facturacion_id ?? null;
    if ('extras' in d) sets.extras = d.extras ? JSON.stringify(d.extras) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.db.updateTable('movimientos').set(sets as any).where('id', '=', id).execute();
    const enriched = await selectMovimientosEnriquecidos(app).where('m.id', '=', id).executeTakeFirstOrThrow();
    return movimientoAFila(enriched);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const r = await app.db.deleteFrom('movimientos').where('id', '=', id).executeTakeFirst();
    if (Number(r.numDeletedRows ?? 0) === 0) return reply.code(404).send({ error: 'Movimiento no encontrado' });
    return { ok: true };
  });

  // ── CORRECCIÓN ──────────────────────────────────────────────────────────
  // Crea un movimiento de signo invertido apuntando al original.
  app.post<{ Params: { id: string } }>('/:id/corregir', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'id inválido' });
    const motivoSchema = z.object({ motivo: z.string().min(1) });
    const parsed = motivoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Motivo requerido' });

    const orig = await app.db.selectFrom('movimientos').selectAll().where('id', '=', id).executeTakeFirst();
    if (!orig) return reply.code(404).send({ error: 'Movimiento original no encontrado' });
    const ahora = new Date().toISOString();

    const tipoInverso = orig.tipo === 'entrada' ? 'salida' : 'entrada';
    const ins = await app.db
      .insertInto('movimientos')
      .values({
        fecha: ahora.slice(0, 10),
        anio: parseInt(ahora.slice(0, 4), 10),
        mes: parseInt(ahora.slice(5, 7), 10),
        tipo: tipoInverso,
        monto_centavos: orig.monto_centavos,
        dueno_id: orig.dueno_id,
        inquilino_id: orig.inquilino_id,
        propiedad_id: orig.propiedad_id,
        concepto: `Corrección de movimiento #${orig.id}`,
        detalle: parsed.data.motivo,
        pagos_de_meses: null,
        mes_facturacion_id: orig.mes_facturacion_id,
        movimiento_original_id: orig.id,
        extras: null,
        creado_en: ahora,
        actualizado_en: ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const enriched = await selectMovimientosEnriquecidos(app).where('m.id', '=', ins.id).executeTakeFirstOrThrow();
    return reply.code(201).send(movimientoAFila(enriched));
  });

  // ── BULK CLEAR ──────────────────────────────────────────────────────────
  app.post('/limpiar', async (req, reply) => {
    const parsed = z
      .object({
        anio: z.number().int(),
        mes: z.number().int(),
        dueno_id: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const { anio, mes, dueno_id } = parsed.data;

    let qDel = app.db.deleteFrom('movimientos').where('anio', '=', anio).where('mes', '=', mes);
    if (dueno_id !== undefined) qDel = qDel.where('dueno_id', '=', dueno_id);
    const r = await qDel.executeTakeFirst();
    return { borrados: Number(r.numDeletedRows ?? 0) };
  });
};
