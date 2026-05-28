/**
 * Validación de número de ficha de propiedad.
 * Formato: X-YYYY donde
 *   X    = entero positivo (sin ceros a la izquierda)
 *   YYYY = año de 4 dígitos en [1900..2100]
 * Ejemplos: "20-2026", "1-1999", "1234-2100".
 */
import { z } from 'zod';

const RE_FICHA = /^[1-9]\d*-(?:19\d{2}|20\d{2}|2100)$/;

export function esFichaValida(s: string): boolean {
  return RE_FICHA.test(s);
}

export function normalizarFicha(s: string): string {
  return s.trim();
}

export const fichaSchema = z
  .string()
  .transform((s) => s.trim())
  .refine(esFichaValida, {
    message: 'La ficha debe tener formato X-YYYY (ej. 20-2026)',
  });
