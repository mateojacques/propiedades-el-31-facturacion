/**
 * Formato y parseo de montos en centavos.
 * Todas las cantidades monetarias internas son enteros (centavos).
 */

export function centavosAPesos(centavos: number): number {
  return centavos / 100;
}

/** "1234567" centavos → "12.345,67" (es-AR sin símbolo). */
export function formatARS(centavos: number): string {
  return (centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "$ 12.345,67" para listas y totales. */
export function formatARSConSimbolo(centavos: number): string {
  return `$ ${formatARS(centavos)}`;
}

/**
 * Convierte un texto ingresado por el usuario (acepta "1234,56", "1234.56",
 * "1.234,56", "1,234.56") a centavos enteros. Retorna 0 si está vacío.
 */
export function parsearPesosACentavos(input: string): number {
  const s = input.trim();
  if (!s) return 0;
  // Normalizar: quitar separadores de miles, mantener decimal.
  // Si tiene ambos . y ,: el último es el decimal.
  let normalizado = s.replace(/\s/g, '');
  const ultimaComa = normalizado.lastIndexOf(',');
  const ultimoPunto = normalizado.lastIndexOf('.');
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    if (ultimaComa > ultimoPunto) {
      // Formato es-AR: 1.234,56
      normalizado = normalizado.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato en-US: 1,234.56
      normalizado = normalizado.replace(/,/g, '');
    }
  } else if (ultimaComa !== -1) {
    normalizado = normalizado.replace(',', '.');
  }
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatFechaCorta(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0]!.split('-');
  return `${d}/${m}/${y}`;
}

export const MESES_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

/** Devuelve YYYY-MM-DD para hoy. */
export function hoyIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
