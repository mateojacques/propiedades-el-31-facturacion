/**
 * Importación de archivos CSV / XLSX.
 *   POST /api/importar/vista-previa  — parsea + valida, NO escribe en DB
 *   POST /api/importar/confirmar     — inserta filas previamente validadas
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { detectFormat, parseFile, type ParsedRow } from '../servicios/importador-parser';
import { validateRows } from '../servicios/importador-validador';

export const rutasImportar: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── VISTA PREVIA ───────────────────────────────────────────────────────
  app.post('/vista-previa', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'Falta el archivo' });
    const buffer = await data.toBuffer();
    const format = detectFormat(data.filename, data.mimetype);
    if (!format) return reply.code(400).send({ error: 'Formato no soportado (use .csv o .xlsx)' });
    try {
      const parsed = await parseFile(buffer, format);
      const result = validateRows(parsed);
      return {
        ok: result.errors.length === 0,
        validas: result.validRows,
        errores: result.errors,
        advertencias: result.warnings,
        total_leidas: parsed.length,
      };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // ── CONFIRMAR ──────────────────────────────────────────────────────────
  const filaSchema = z.object({
    rowNumber: z.number().int(),
    date: z.string(),
    rawDate: z.string(),
    duenoName: z.string(),
    propertyFileNumber: z.string(),
    inquilinoName: z.string(),
    tipo: z.enum(['entrada', 'salida']),
    montoCentavos: z.number().int().positive(),
    paymentForMonths: z.array(z.object({ anio: z.number().int(), mes: z.number().int() })),
    parseErrors: z.array(z.string()),
  });

  app.post('/confirmar', async (req, reply) => {
    const parsed = z.object({ filas: z.array(filaSchema) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Filas inválidas' });
    const filas = parsed.data.filas as ParsedRow[];

    const resultado = await app.db.transaction().execute(async (trx) => {
      const ahora = new Date().toISOString();
      let insertadas = 0;

      for (const f of filas) {
        if (!f.date || !f.tipo) continue;
        const [y, m] = f.date.split('-');
        await trx
          .insertInto('movimientos')
          .values({
            fecha: f.date,
            anio: parseInt(y!, 10),
            mes: parseInt(m!, 10),
            tipo: f.tipo,
            monto_centavos: f.montoCentavos,
            dueno: f.duenoName || null,
            inquilino: f.inquilinoName || null,
            propiedad: f.propertyFileNumber || null,
            concepto: '',
            detalle: null,
            pagos_de_meses: f.paymentForMonths.length ? JSON.stringify(f.paymentForMonths) : null,
            mes_facturacion_id: null,
            movimiento_original_id: null,
            extras: null,
            creado_en: ahora,
            actualizado_en: ahora,
          })
          .execute();
        insertadas++;
      }
      return { insertadas };
    });
    return resultado;
  });
};
