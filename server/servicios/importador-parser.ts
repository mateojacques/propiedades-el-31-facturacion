/**
 * importador-parser.ts — CSV / XLSX → ParsedRow[]
 *
 * Acepta planillas con columnas "Entrada" y "Salida" (formato original)
 * y las normaliza a un único `tipo` + `montoCentavos` por fila.
 *   - Si solo entrada > 0 → tipo='entrada'
 *   - Si solo salida > 0  → tipo='salida'
 *   - Si ambas > 0        → fila con parseError (validator la rechaza)
 *   - Si ambas == 0       → fila con parseError (validator la rechaza)
 */
import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export type TipoMovimientoParsed = 'entrada' | 'salida';

export interface ParsedRow {
  rowNumber: number;
  date: string | null;
  rawDate: string;
  duenoName: string;
  propertyFileNumber: string;
  inquilinoName: string;
  tipo: TipoMovimientoParsed | null;
  montoCentavos: number;
  paymentForMonths: Array<{ anio: number; mes: number }>;
  parseErrors: string[];
}

export type FileFormat = 'csv' | 'xlsx';

export const detectFormat = (filename: string, mimetype: string): FileFormat | null => {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.csv') || mimetype === 'text/csv') return 'csv';
  if (
    lower.endsWith('.xlsx') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel'
  ) {
    return 'xlsx';
  }
  return null;
};

type Canonical =
  | 'date'
  | 'dueno'
  | 'property'
  | 'inquilino'
  | 'amount_in'
  | 'amount_out'
  | 'balance'
  | 'payment_months';

const REQUIRED_CANONICALS: Canonical[] = ['date', 'dueno', 'inquilino', 'amount_in', 'amount_out'];

const REQUIRED_LABELS: Record<Canonical, string> = {
  date: 'Fecha',
  dueno: 'Dueño',
  property: 'Propiedad',
  inquilino: 'Inquilino',
  amount_in: 'Entrada',
  amount_out: 'Salida',
  balance: 'Balance',
  payment_months: 'Pagos del Mes',
};

const foldHeader = (h: string): string =>
  String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const HEADER_ALIASES: Record<string, Canonical> = {
  fecha: 'date',
  dueno: 'dueno',
  propietario: 'dueno',
  propiedad: 'property',
  inquilino: 'inquilino',
  ocupante: 'inquilino',
  entrada: 'amount_in',
  'monto entrada': 'amount_in',
  salida: 'amount_out',
  'monto salida': 'amount_out',
  balance: 'balance',
  'pagos del mes': 'payment_months',
};

const buildHeaderMap = (rawHeaders: string[]): Record<string, Canonical> => {
  const map: Record<string, Canonical> = {};
  for (const raw of rawHeaders) {
    if (raw == null) continue;
    const folded = foldHeader(raw);
    const canonical = HEADER_ALIASES[folded];
    if (canonical) map[raw] = canonical;
  }
  const present = new Set<Canonical>(Object.values(map));
  const missing = REQUIRED_CANONICALS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    const labels = missing.map((m) => REQUIRED_LABELS[m]).join(', ');
    throw new Error(`Encabezados faltantes: ${labels}`);
  }
  return map;
};

export const parseDate = (raw: unknown): string | null => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return null;
};

export const parseAmountToCentavos = (raw: unknown): number => {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    return Math.round(raw * 100);
  }
  let s = String(raw).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, '').replace(/\s/g, '');
  s = s.replace(/^[\u2212\u2012\u2013\u2014]/, '-');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1]!.length === 2) {
      // already in decimal form
    } else {
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

const MONTH_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const foldMonthName = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const parsePaymentMonths = (raw: unknown): Array<{ anio: number; mes: number }> => {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const out: Array<{ anio: number; mes: number }> = [];
  const parts = s.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
    if (!m) continue;
    const monthName = foldMonthName(m[1]!);
    const mes = MONTH_MAP[monthName];
    const anio = parseInt(m[2]!, 10);
    if (mes && Number.isFinite(anio)) out.push({ anio, mes });
  }
  return out;
};

export const extractFileNumber = (raw: unknown): string => {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const m = s.match(/^(.+?)\s+[—–-]\s+.+$/);
  return (m ? m[1]! : s).trim();
};

type RawRow = Record<string, unknown>;

interface NormalizeContext {
  headerMap: Record<string, Canonical>;
  rowNumber: number;
}

const valueFor = (row: RawRow, headerMap: Record<string, Canonical>, key: Canonical): unknown => {
  for (const [rawHeader, canonical] of Object.entries(headerMap)) {
    if (canonical === key) {
      const v = row[rawHeader];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return '';
};

const normalizeRow = (row: RawRow, ctx: NormalizeContext): ParsedRow => {
  const { headerMap, rowNumber } = ctx;
  const parseErrors: string[] = [];
  const rawDate = String(valueFor(row, headerMap, 'date') ?? '').trim();
  const date = parseDate(rawDate);
  if (rawDate && !date) parseErrors.push(`Fecha inválida: "${rawDate}"`);
  const duenoName = String(valueFor(row, headerMap, 'dueno') ?? '').trim();
  const inquilinoName = String(valueFor(row, headerMap, 'inquilino') ?? '').trim();
  const propertyFileNumber = extractFileNumber(valueFor(row, headerMap, 'property'));
  const amountIn = parseAmountToCentavos(valueFor(row, headerMap, 'amount_in'));
  const amountOut = parseAmountToCentavos(valueFor(row, headerMap, 'amount_out'));
  const paymentForMonths = parsePaymentMonths(valueFor(row, headerMap, 'payment_months'));

  let tipo: TipoMovimientoParsed | null = null;
  let montoCentavos = 0;
  if (amountIn > 0 && amountOut > 0) {
    parseErrors.push('La fila tiene entrada y salida simultáneas; debe ser una u otra');
  } else if (amountIn > 0) {
    tipo = 'entrada';
    montoCentavos = amountIn;
  } else if (amountOut > 0) {
    tipo = 'salida';
    montoCentavos = amountOut;
  }

  return {
    rowNumber,
    date,
    rawDate,
    duenoName,
    propertyFileNumber,
    inquilinoName,
    tipo,
    montoCentavos,
    paymentForMonths,
    parseErrors,
  };
};

const sniffDelimiter = (text: string): ',' | ';' => {
  const sample = text.slice(0, 1024);
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (c === ',') commas++;
    else if (c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
};

const parseCsv = (buffer: Buffer): ParsedRow[] => {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = sniffDelimiter(text);
  const records: RawRow[] = parseCsvSync(text, {
    columns: true,
    bom: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    skip_records_with_error: true,
    trim: true,
  });
  if (records.length === 0) return [];
  const rawHeaders = Object.keys(records[0]!);
  const headerMap = buildHeaderMap(rawHeaders);
  return records.map((record, idx) => normalizeRow(record, { headerMap, rowNumber: idx + 1 }));
};

const extractCellValue = (value: unknown): unknown => {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('result' in obj && obj.result !== undefined) return extractCellValue(obj.result);
    if ('text' in obj && typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: unknown }>)
        .map((seg) => (seg && typeof seg.text === 'string' ? seg.text : ''))
        .join('');
    }
    if ('value' in obj) return extractCellValue(obj.value);
  }
  return String(value);
};

const parseXlsx = async (buffer: Buffer): Promise<ParsedRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo XLSX no contiene hojas.');
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1);
    rows.push(values.map(extractCellValue));
  });
  if (rows.length === 0) return [];
  const headerRow = rows[0]!;
  const rawHeaders = headerRow.map((v) => String(v ?? '').trim());
  const headerMap = buildHeaderMap(rawHeaders);
  const dataRows = rows.slice(1);
  const out: ParsedRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]!;
    const record: RawRow = {};
    let nonEmpty = false;
    for (let h = 0; h < rawHeaders.length; h++) {
      const header = rawHeaders[h]!;
      if (!header) continue;
      const cell = cells[h];
      if (cell !== undefined && cell !== null && cell !== '') nonEmpty = true;
      record[header] = cell ?? '';
    }
    if (!nonEmpty) continue;
    out.push(normalizeRow(record, { headerMap, rowNumber: i + 1 }));
  }
  return out;
};

export const parseFile = async (buffer: Buffer, format: FileFormat): Promise<ParsedRow[]> => {
  if (!buffer || buffer.length === 0) throw new Error('El archivo está vacío.');
  if (format === 'csv') return parseCsv(buffer);
  if (format === 'xlsx') return parseXlsx(buffer);
  throw new Error(`Formato no soportado: ${format}`);
};
