/**
 * Exportación CSV / Excel.
 *   GET /api/exportar/csv?anio&mes&dueno_id
 *   GET /api/exportar/excel?anio&mes&dueno_id
 *
 * Cada movimiento se exporta como una fila con columnas "Entrada" y
 * "Salida" (relleno selectivo según `tipo`) para mantener compatibilidad
 * con el formato planilla histórico. Los nombres de dueño/inquilino y la
 * ficha de propiedad se resuelven por LEFT JOIN.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { deCentavos } from '../servicios/calculos';

const filtroSchema = z.object({
  anio: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().optional(),
  dueno_id: z.coerce.number().int().optional(),
});

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function selectEnriquecidos(app: FastifyInstance) {
  return app.db
    .selectFrom('movimientos as m')
    .leftJoin('duenos as d', 'd.id', 'm.dueno_id')
    .leftJoin('inquilinos as i', 'i.id', 'm.inquilino_id')
    .leftJoin('propiedades as p', 'p.id', 'm.propiedad_id')
    .select([
      'm.id as id',
      'm.fecha as fecha',
      'm.tipo as tipo',
      'm.monto_centavos as monto_centavos',
      'm.concepto as concepto',
      'm.detalle as detalle',
      'd.nombre as dueno_nombre',
      'i.nombre as inquilino_nombre',
      'p.ficha as propiedad_ficha',
    ]);
}

export const rutasExportar: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── CSV ─────────────────────────────────────────────────────────────────
  app.get('/csv', async (req, reply) => {
    const parsed = filtroSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;
    const filas = await selectEnriquecidos(app)
      .$if(f.anio !== undefined, (qb) => qb.where('m.anio', '=', f.anio!))
      .$if(f.mes !== undefined, (qb) => qb.where('m.mes', '=', f.mes!))
      .$if(f.dueno_id !== undefined, (qb) => qb.where('m.dueno_id', '=', f.dueno_id!))
      .orderBy('m.fecha', 'asc')
      .orderBy('m.id', 'asc')
      .execute();

    const headers = ['Fecha', 'Dueño', 'Propiedad', 'Inquilino', 'Entrada', 'Salida', 'Concepto', 'Detalle'];
    const lines: string[] = [headers.join(',')];
    let saldo = 0;
    for (const r of filas) {
      const entrada = r.tipo === 'entrada' ? r.monto_centavos : 0;
      const salida = r.tipo === 'salida' ? r.monto_centavos : 0;
      saldo += entrada - salida;
      lines.push(
        [
          r.fecha,
          r.dueno_nombre ?? '',
          r.propiedad_ficha ?? '',
          r.inquilino_nombre ?? '',
          deCentavos(entrada).toFixed(2),
          deCentavos(salida).toFixed(2),
          r.concepto,
          r.detalle ?? '',
        ].map(escapeCsvCell).join(',')
      );
    }
    lines.push(['', '', '', 'BALANCE', '', '', deCentavos(saldo).toFixed(2), ''].map(escapeCsvCell).join(','));

    const csv = '\uFEFF' + lines.join('\r\n');
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="movimientos.csv"`)
      .send(csv);
  });

  // ── EXCEL ───────────────────────────────────────────────────────────────
  app.get('/excel', async (req, reply) => {
    const parsed = filtroSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;
    const filas = await selectEnriquecidos(app)
      .$if(f.anio !== undefined, (qb) => qb.where('m.anio', '=', f.anio!))
      .$if(f.mes !== undefined, (qb) => qb.where('m.mes', '=', f.mes!))
      .$if(f.dueno_id !== undefined, (qb) => qb.where('m.dueno_id', '=', f.dueno_id!))
      .orderBy('m.fecha', 'asc')
      .orderBy('m.id', 'asc')
      .execute();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimientos');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Dueño', key: 'dueno', width: 24 },
      { header: 'Propiedad', key: 'propiedad', width: 14 },
      { header: 'Inquilino', key: 'inquilino', width: 24 },
      { header: 'Entrada', key: 'entrada', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'Salida', key: 'salida', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'Concepto', key: 'concepto', width: 28 },
      { header: 'Detalle', key: 'detalle', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };

    let entradas = 0;
    let salidas = 0;
    for (const r of filas) {
      const entrada = r.tipo === 'entrada' ? r.monto_centavos : 0;
      const salida = r.tipo === 'salida' ? r.monto_centavos : 0;
      entradas += entrada;
      salidas += salida;
      ws.addRow({
        fecha: r.fecha,
        dueno: r.dueno_nombre ?? '',
        propiedad: r.propiedad_ficha ?? '',
        inquilino: r.inquilino_nombre ?? '',
        entrada: deCentavos(entrada),
        salida: deCentavos(salida),
        concepto: r.concepto,
        detalle: r.detalle ?? '',
      });
    }

    ws.addRow({});
    const filaTotales = ws.addRow({
      dueno: 'TOTALES',
      entrada: deCentavos(entradas),
      salida: deCentavos(salidas),
    });
    filaTotales.font = { bold: true };
    const filaBalance = ws.addRow({
      dueno: 'BALANCE',
      entrada: deCentavos(entradas - salidas),
    });
    filaBalance.font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="movimientos.xlsx"`)
      .send(Buffer.from(buffer));
  });
};
