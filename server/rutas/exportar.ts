/**
 * Exportación CSV / Excel.
 *   GET /api/exportar/csv?anio&mes&dueno
 *   GET /api/exportar/excel?anio&mes&dueno
 *
 * Cada movimiento se exporta como una fila con columnas "Entrada" y
 * "Salida" (relleno selectivo según `tipo`) para mantener compatibilidad
 * con el formato planilla histórico.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { deCentavos } from '../servicios/calculos';

const filtroSchema = z.object({
  anio: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().optional(),
  dueno: z.string().optional(),
});

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const rutasExportar: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ── CSV ─────────────────────────────────────────────────────────────────
  app.get('/csv', async (req, reply) => {
    const parsed = filtroSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;
    const filas = await app.db
      .selectFrom('movimientos')
      .selectAll()
      .$if(f.anio !== undefined, (qb) => qb.where('anio', '=', f.anio!))
      .$if(f.mes !== undefined, (qb) => qb.where('mes', '=', f.mes!))
      .$if(!!f.dueno, (qb) => qb.where('dueno', '=', f.dueno!))
      .orderBy('fecha', 'asc')
      .orderBy('id', 'asc')
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
          r.dueno ?? '',
          r.propiedad ?? '',
          r.inquilino ?? '',
          deCentavos(entrada).toFixed(2),
          deCentavos(salida).toFixed(2),
          r.concepto,
          r.detalle ?? '',
        ].map(escapeCsvCell).join(',')
      );
    }
    // Línea final de balance.
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
    const filas = await app.db
      .selectFrom('movimientos')
      .selectAll()
      .$if(f.anio !== undefined, (qb) => qb.where('anio', '=', f.anio!))
      .$if(f.mes !== undefined, (qb) => qb.where('mes', '=', f.mes!))
      .$if(!!f.dueno, (qb) => qb.where('dueno', '=', f.dueno!))
      .orderBy('fecha', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimientos');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Dueño', key: 'dueno', width: 24 },
      { header: 'Propiedad', key: 'propiedad', width: 20 },
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
        dueno: r.dueno ?? '',
        propiedad: r.propiedad ?? '',
        inquilino: r.inquilino ?? '',
        entrada: deCentavos(entrada),
        salida: deCentavos(salida),
        concepto: r.concepto,
        detalle: r.detalle ?? '',
      });
    }

    // Fila de totales y balance.
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
