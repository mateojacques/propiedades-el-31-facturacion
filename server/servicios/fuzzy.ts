/**
 * fuzzy.ts — Búsqueda fuzzy sin dependencias externas.
 *
 * Estrategia: normalización (lowercase + sin acentos) + match parcial
 * por substring + distancia de Levenshtein (≤ 2 ediciones) sobre palabras.
 *
 * Diseñado para listas chicas/medianas (cientos a pocos miles de filas).
 * Para datasets más grandes considerar FTS5 o un índice invertido.
 */

/** Normaliza para comparación case- y accent-insensitive. */
export function normalizar(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Distancia de Levenshtein (edición) entre dos strings.
 * Implementación iterativa con buffer de dos filas — O(n·m) tiempo,
 * O(min(n,m)) memoria.
 */
export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Asegurar a ≤ b en longitud para minimizar memoria.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const filaPrev = new Array<number>(a.length + 1);
  const filaCurr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) filaPrev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    filaCurr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      filaCurr[i] = Math.min(
        filaCurr[i - 1]! + 1,        // inserción
        filaPrev[i]! + 1,            // borrado
        filaPrev[i - 1]! + costo      // sustitución
      );
    }
    for (let i = 0; i <= a.length; i++) filaPrev[i] = filaCurr[i]!;
  }
  return filaPrev[a.length]!;
}

/**
 * ¿La query matchea el texto?
 *   1. Match exacto de substring (normalizado) → sí.
 *   2. Si no, intenta fuzzy: divide el texto en palabras y devuelve true si
 *      alguna palabra tiene distancia ≤ maxDistancia con la query.
 *      Para queries muy cortas (≤ 3 chars) se exige match exacto para
 *      evitar falsos positivos.
 */
export function matchFuzzy(
  query: string,
  texto: string | null | undefined,
  maxDistancia = 2
): boolean {
  const q = normalizar(query);
  const t = normalizar(texto);
  if (!q) return true;
  if (!t) return false;
  if (t.includes(q)) return true;
  if (q.length <= 3) return false;
  const palabras = t.split(/\s+/);
  for (const p of palabras) {
    if (p.length < 3) continue;
    if (distanciaLevenshtein(q, p) <= maxDistancia) return true;
    // También permitir match en prefijos largos de palabras (ej. "rodriguz" vs "rodriguez")
    if (p.length > q.length && distanciaLevenshtein(q, p.slice(0, q.length)) <= maxDistancia) {
      return true;
    }
  }
  return false;
}
