/**
 * Liquidación PDF.
 *   GET /api/liquidacion/pdf?anio&mes&dueno&comision
 *
 * Agrupa por coincidencia exacta de `dueno` (string).
 *
 * El layout usa coordenadas X absolutas por columna en vez de `continued: true`
 * (que avanza el cursor por el ancho del texto renderizado, no por el ancho
 * de columna, y rompe el alineado en filas con contenido multilínea).
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import {
  calcularLiquidacionDueno,
  deCentavos,
  type MovimientoCalc,
} from '../servicios/calculos';

const filtroSchema = z.object({
  anio: z.coerce.number().int(),
  mes: z.coerce.number().int().min(1).max(12),
  dueno: z.string().min(1),
  comision: z.coerce.number().min(0).max(100).default(0),
});

const MESES_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatARS(centavos: number): string {
  const n = deCentavos(centavos);
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFechaCorta(iso: string): string {
  // 2026-05-28 → 28/05/2026
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export const rutasLiquidacion: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/pdf', async (req, reply) => {
    const parsed = filtroSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    const f = parsed.data;

    const filas = await app.db
      .selectFrom('movimientos')
      .selectAll()
      .where('anio', '=', f.anio)
      .where('mes', '=', f.mes)
      .where('dueno', '=', f.dueno)
      .orderBy('fecha', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const movimientos: MovimientoCalc[] = filas.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      tipo: r.tipo,
      monto_centavos: r.monto_centavos,
      dueno: r.dueno ?? undefined,
      inquilino: r.inquilino ?? undefined,
      propiedad: r.propiedad ?? undefined,
    }));

    const liq = calcularLiquidacionDueno(movimientos, f.dueno, f.comision, { anio: f.anio, mes: f.mes });

    // ── PDF setup ──────────────────────────────────────────────────────────
    const MARGIN = 50;
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const CONTENT_W = PAGE_W - MARGIN * 2; // 495 en A4

    // Columnas (suman CONTENT_W). Damos más espacio a Concepto/Inquilino.
    const COL = {
      fecha:    { x: MARGIN,                          w: 65,  align: 'left'  as const },
      concepto: { x: MARGIN + 65,                     w: 230, align: 'left'  as const },
      entrada:  { x: MARGIN + 65 + 230,               w: 100, align: 'right' as const },
      salida:   { x: MARGIN + 65 + 230 + 100,         w: 100, align: 'right' as const },
    };
    const ROW_PAD_Y = 6;
    const ROW_PAD_INNER = 4;

    // ── Encabezado ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18)
       .text('Liquidación de Dueño', MARGIN, MARGIN, { width: CONTENT_W, align: 'center' });
    doc.moveDown(1);

    // Bloque de metadatos en dos columnas (etiqueta+valor).
    const metaY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Dueño:',   MARGIN,        metaY, { width: 80 });
    doc.text('Período:', MARGIN,        metaY + 16, { width: 80 });
    doc.text('Comisión:',MARGIN,        metaY + 32, { width: 80 });
    doc.font('Helvetica').fontSize(10);
    doc.text(f.dueno,                          MARGIN + 80, metaY,      { width: CONTENT_W - 80 });
    doc.text(`${MESES_ES[f.mes]} ${f.anio}`,   MARGIN + 80, metaY + 16, { width: CONTENT_W - 80 });
    doc.text(`${f.comision}%`,                 MARGIN + 80, metaY + 32, { width: CONTENT_W - 80 });
    doc.y = metaY + 32 + 16;
    doc.moveDown(0.5);

    // ── Header de la tabla ────────────────────────────────────────────────
    function drawTableHeader(): void {
      const headerY = doc.y;
      const headerH = 22;
      // Fondo gris claro.
      doc.save()
         .rect(MARGIN, headerY, CONTENT_W, headerH)
         .fill('#eeeeee')
         .restore();
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(10);
      const ty = headerY + (headerH - 10) / 2;
      doc.text('Fecha',                COL.fecha.x    + ROW_PAD_INNER, ty,
               { width: COL.fecha.w    - ROW_PAD_INNER * 2, align: COL.fecha.align });
      doc.text('Concepto / Inquilino', COL.concepto.x + ROW_PAD_INNER, ty,
               { width: COL.concepto.w - ROW_PAD_INNER * 2, align: COL.concepto.align });
      doc.text('Entrada',              COL.entrada.x  + ROW_PAD_INNER, ty,
               { width: COL.entrada.w  - ROW_PAD_INNER * 2, align: COL.entrada.align });
      doc.text('Salida',               COL.salida.x   + ROW_PAD_INNER, ty,
               { width: COL.salida.w   - ROW_PAD_INNER * 2, align: COL.salida.align });
      // Línea inferior del header.
      doc.moveTo(MARGIN, headerY + headerH)
         .lineTo(MARGIN + CONTENT_W, headerY + headerH)
         .lineWidth(0.8).stroke('#888');
      doc.y = headerY + headerH;
      doc.font('Helvetica').fillColor('#000');
    }

    drawTableHeader();

    // ── Filas ─────────────────────────────────────────────────────────────
    const BOTTOM_LIMIT = PAGE_H - MARGIN - 140; // reservar espacio para totales

    doc.fontSize(10);
    let zebra = false;

    for (const r of filas) {
      const fechaTxt    = formatFechaCorta(r.fecha);
      const conceptoTxt = `${r.concepto || ''}${r.inquilino ? ' · ' + r.inquilino : ''}`.trim() || '—';
      const entradaTxt  = r.tipo === 'entrada' ? formatARS(r.monto_centavos) : '';
      const salidaTxt   = r.tipo === 'salida'  ? formatARS(r.monto_centavos) : '';

      // Altura de la fila = max altura de todas las celdas (concepto es la que puede envolver).
      const hConcepto = doc.heightOfString(conceptoTxt, { width: COL.concepto.w - ROW_PAD_INNER * 2 });
      const hFecha    = doc.heightOfString(fechaTxt,    { width: COL.fecha.w    - ROW_PAD_INNER * 2 });
      const rowH = Math.max(hConcepto, hFecha, 12) + ROW_PAD_Y;

      // Salto de página si no entra.
      if (doc.y + rowH > BOTTOM_LIMIT) {
        doc.addPage();
        drawTableHeader();
      }

      const yStart = doc.y;

      // Fondo zebra.
      if (zebra) {
        doc.save()
           .rect(MARGIN, yStart, CONTENT_W, rowH)
           .fill('#fafafa')
           .restore();
      }
      doc.fillColor('#000');

      const ty = yStart + ROW_PAD_Y / 2;
      doc.text(fechaTxt,    COL.fecha.x    + ROW_PAD_INNER, ty,
               { width: COL.fecha.w    - ROW_PAD_INNER * 2, align: COL.fecha.align });
      doc.text(conceptoTxt, COL.concepto.x + ROW_PAD_INNER, ty,
               { width: COL.concepto.w - ROW_PAD_INNER * 2, align: COL.concepto.align });
      doc.text(entradaTxt,  COL.entrada.x  + ROW_PAD_INNER, ty,
               { width: COL.entrada.w  - ROW_PAD_INNER * 2, align: COL.entrada.align });
      doc.text(salidaTxt,   COL.salida.x   + ROW_PAD_INNER, ty,
               { width: COL.salida.w   - ROW_PAD_INNER * 2, align: COL.salida.align });

      // Forzar Y al final de la fila (ignorando dónde la dejó el último text).
      doc.y = yStart + rowH;
      zebra = !zebra;
    }

    // Línea final de la tabla.
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).lineWidth(0.8).stroke('#888');
    doc.moveDown(1);

    // Si no hubo filas, dejar mensaje.
    if (filas.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666')
         .text('Sin movimientos en el período.', MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
      doc.fillColor('#000').font('Helvetica');
      doc.moveDown(1);
    }

    // ── Totales: caja a la derecha ────────────────────────────────────────
    const totalsBoxW = 260;
    const totalsBoxX = MARGIN + CONTENT_W - totalsBoxW;

    // Si los totales no entran en la página actual, salto.
    if (doc.y + 110 > PAGE_H - MARGIN) {
      doc.addPage();
    }

    let ty = doc.y;
    const lineH = 18;
    const labelW = 150;
    const valueW = totalsBoxW - labelW - 16;

    // Marco.
    doc.save()
       .rect(totalsBoxX, ty, totalsBoxW, lineH * 3 + 36)
       .lineWidth(0.8)
       .stroke('#888')
       .restore();

    function row(label: string, value: string, opts?: { bold?: boolean; size?: number }): void {
      const size = opts?.size ?? 10;
      doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      doc.text(label, totalsBoxX + 8,           ty + 4, { width: labelW, align: 'left' });
      doc.text(value, totalsBoxX + 8 + labelW,  ty + 4, { width: valueW, align: 'right' });
      ty += lineH;
    }

    row('Total entradas',          `$ ${formatARS(liq.total_entradas_centavos)}`);
    row('Total salidas',           `$ ${formatARS(liq.total_salidas_centavos)}`);
    row(`Comisión (${f.comision}%)`, `$ ${formatARS(liq.comision_centavos)}`);

    // Separador antes del neto.
    doc.moveTo(totalsBoxX + 8, ty + 2)
       .lineTo(totalsBoxX + totalsBoxW - 8, ty + 2)
       .lineWidth(0.5).stroke('#888');
    ty += 6;

    row('Neto a dueño', `$ ${formatARS(liq.neto_dueno_centavos)}`, { bold: true, size: 12 });

    doc.y = ty + 8;

    // ── Pie ────────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(8).fillColor('#888')
       .text(
         `Generado el ${new Date().toLocaleString('es-AR')}`,
         MARGIN, PAGE_H - MARGIN - 12,
         { width: CONTENT_W, align: 'right' }
       );

    doc.end();
    const pdfBuffer = await done;

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="liquidacion-${f.anio}-${String(f.mes).padStart(2, '0')}.pdf"`)
      .send(pdfBuffer);
  });
};
