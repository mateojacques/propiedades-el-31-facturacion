/**
 * importador-validador.ts — Validación de filas parseadas.
 *
 * Aplica reglas semánticas posteriores al parseo y deduplica.
 */
import type { ParsedRow } from './importador-parser';

export interface ValidationError {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  validRows: ParsedRow[];
  errors: ValidationError[];
  warnings: ValidationError[];
}

const dedupeKey = (row: ParsedRow): string => {
  const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();
  return [
    row.date ?? '',
    norm(row.duenoName),
    norm(row.inquilinoName),
    norm(row.propertyFileNumber),
    row.tipo ?? '',
    String(row.montoCentavos),
  ].join('|');
};

export const validateRows = (rows: ParsedRow[]): ValidationResult => {
  if (rows.length === 0) {
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: 'Archivo vacío o sin filas válidas' }],
      warnings: [],
    };
  }
  const validRows: ParsedRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  for (const row of rows) {
    if (row.date === null) {
      errors.push({ rowNumber: row.rowNumber, field: 'Fecha', message: `Fecha inválida o faltante: "${row.rawDate}"` });
      continue;
    }
    if (row.tipo === null || row.montoCentavos <= 0) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'Entrada/Salida',
        message: row.parseErrors.length > 0
          ? row.parseErrors.join('; ')
          : 'Debe ingresar un monto > 0 en entrada o en salida (no ambas)',
      });
      continue;
    }
    if (row.parseErrors.length > 0) {
      for (const msg of row.parseErrors) {
        warnings.push({ rowNumber: row.rowNumber, message: msg });
      }
    }
    validRows.push(row);
  }
  const seen = new Map<string, number>();
  for (const row of validRows) {
    const key = dedupeKey(row);
    const firstSeenAt = seen.get(key);
    if (firstSeenAt !== undefined) {
      warnings.push({ rowNumber: row.rowNumber, message: 'Fila duplicada (mismo día, mismas entidades, mismo monto y tipo)' });
    } else {
      seen.set(key, row.rowNumber);
    }
  }
  return { validRows, errors, warnings };
};
