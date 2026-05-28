/**
 * Rutas REST de movimientos:
 *   GET    /api/movimientos              — listado con filtros, búsqueda fuzzy y paginado
 *   GET    /api/movimientos/balance      — balance del período (entradas − salidas)
 *   GET    /api/movimientos/:id
 *   POST   /api/movimientos              — alta
 *   PATCH  /api/movimientos/:id          — modificación
 *   DELETE /api/movimientos/:id          — baja
 *   POST   /api/movimientos/:id/corregir — crea un movimiento de signo invertido
 *                                          referenciando al original
 *   POST   /api/movimientos/limpiar      — borrado masivo por período/dueno
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { movimientoAFila } from '../servicios/movimientos-util';
import { matchFuzzy } from '../servicios/fuzzy';

const nuevoMovimientoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(['entrada', 'salida']),
  monto_centavos: z.number().int().positive(),
  dueno: z.string().nullable().optional(),
  inquilino: z.string().nullable().optional(),
  propiedad: z.string().nullable().optional(),
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
  dueno: z.string().optional(),
  inquilino: z.string().optional(),
  q: z.string().optional(),
  tipo: z.enum(['entrada', 'salida']).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(500).default(100),
});

const filtroBalanceSchema = z.object({
  anio: z.coerce.number().int().min(1900).max(3000),
  mes: z.coerce.number().int().min(1).max(12),
  dueno: z.string().optional(),
});

function periodoDeFecha(fechaIso: string): { anio: number; mes: number } {
  const [y, m] = fechaIso.split('-');
  return { anio: parseInt(y!, 10), mes: parseInt(m!, 10) };
}

export const rutasMovimientos: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── LIST ────────────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const parsed = filtroListaSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;

    // 1. Query base sin la búsqueda fuzzy. Trae el universo del período/dueño.
    let baseQuery = app.db.selectFrom('movimientos').selectAll();
    if (f.anio !== undefined) baseQuery = baseQuery.where('anio', '=', f.anio);
    if (f.mes !== undefined) baseQuery = baseQuery.where('mes', '=', f.mes);
    if (f.dueno) baseQuery = baseQuery.where('dueno', '=', f.dueno);
    if (f.inquilino) baseQuery = baseQuery.where('inquilino', '=', f.inquilino);
    if (f.tipo) baseQuery = baseQuery.where('tipo', '=', f.tipo);
    if (f.desde) baseQuery = baseQuery.where('fecha', '>=', f.desde);
    if (f.hasta) baseQuery = baseQuery.where('fecha', '<=', f.hasta);

    const candidatos = await baseQuery
      .orderBy('fecha', 'desc')
      .orderBy('id', 'desc')
      .execute();

    // 2. Búsqueda fuzzy en JS sobre `dueno` cuando hay `q`.
    const filtrados = f.q
      ? candidatos.filter((r) => matchFuzzy(f.q!, r.dueno))
      : candidatos;

    // 3. Paginación post-filtrado.
    const total = filtrados.length;
    const inicio = (f.pagina - 1) * f.por_pagina;
    const pagina = filtrados.slice(inicio, inicio + f.por_pagina);

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
      .$if(!!f.dueno, (qb) => qb.where('dueno', '=', f.dueno!))
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
    const fila = await app.db.selectFrom('movimientos').selectAll().where('id', '=', id).executeTakeFirst();
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
        dueno: d.dueno ?? null,
        inquilino: d.inquilino ?? null,
        propiedad: d.propiedad ?? null,
        concepto: d.concepto,
        detalle: d.detalle ?? null,
        pagos_de_meses: d.pagos_de_meses ? JSON.stringify(d.pagos_de_meses) : null,
        mes_facturacion_id: d.mes_facturacion_id ?? null,
        movimiento_original_id: d.movimiento_original_id ?? null,
        extras: d.extras ? JSON.stringify(d.extras) : null,
        creado_en: ahora,
        actualizado_en: ahora,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.code(201).send(movimientoAFila(insertado));
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
    if ('dueno' in d) sets.dueno = d.dueno ?? null;
    if ('inquilino' in d) sets.inquilino = d.inquilino ?? null;
    if ('propiedad' in d) sets.propiedad = d.propiedad ?? null;
    if (d.concepto !== undefined) sets.concepto = d.concepto;
    if ('detalle' in d) sets.detalle = d.detalle ?? null;
    if (d.pagos_de_meses) sets.pagos_de_meses = JSON.stringify(d.pagos_de_meses);
    if ('mes_facturacion_id' in d) sets.mes_facturacion_id = d.mes_facturacion_id ?? null;
    if ('extras' in d) sets.extras = d.extras ? JSON.stringify(d.extras) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.db.updateTable('movimientos').set(sets as any).where('id', '=', id).execute();
    const final = await app.db.selectFrom('movimientos').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    return movimientoAFila(final);
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
        dueno: orig.dueno,
        inquilino: orig.inquilino,
        propiedad: orig.propiedad,
        concepto: `Corrección de movimiento #${orig.id}`,
        detalle: parsed.data.motivo,
        pagos_de_meses: null,
        mes_facturacion_id: orig.mes_facturacion_id,
        movimiento_original_id: orig.id,
        extras: null,
        creado_en: ahora,
        actualizado_en: ahora,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reply.code(201).send(movimientoAFila(ins));
  });

  // ── BULK CLEAR ──────────────────────────────────────────────────────────
  app.post('/limpiar', async (req, reply) => {
    const parsed = z
      .object({
        anio: z.number().int(),
        mes: z.number().int(),
        dueno: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const { anio, mes, dueno } = parsed.data;

    let qDel = app.db.deleteFrom('movimientos').where('anio', '=', anio).where('mes', '=', mes);
    if (dueno) qDel = qDel.where('dueno', '=', dueno);
    const r = await qDel.executeTakeFirst();
    return { borrados: Number(r.numDeletedRows ?? 0) };
  });
};
