/**
 * calculos.ts — Motor de cálculo (funciones puras).
 *
 * Modelo nuevo: cada movimiento es de tipo 'entrada' o 'salida' con un
 * `monto_centavos` único. El balance del mes se recalcula desde cero a
 * partir del listado completo — no hay running balance persistido.
 *
 * TODOS los valores monetarios son ENTEROS en CENTAVOS.
 * CERO aritmética en punto flotante (salvo el límite de conversión).
 * CERO efectos secundarios — sin DB, sin I/O, sin mutación de entrada.
 */

export type TipoMovimiento = 'entrada' | 'salida';

export interface MovimientoCalc {
  id?: number;
  fecha: string; // ISO YYYY-MM-DD
  tipo: TipoMovimiento;
  monto_centavos: number;
  dueno?: string | null;
  inquilino?: string | null;
  propiedad?: string | null;
  pagos_de_meses?: Array<{ anio: number; mes: number }>;
}

export interface BalanceMensual {
  total_entradas_centavos: number;
  total_salidas_centavos: number;
  balance_centavos: number;
  cantidad: number;
}

export interface LiquidacionResultado {
  dueno: string;
  movimientos: MovimientoCalc[];
  total_entradas_centavos: number;
  total_salidas_centavos: number;
  comision_centavos: number;
  neto_dueno_centavos: number;
  periodo: { anio: number; mes: number };
}

/**
 * Suma todos los movimientos y calcula el balance (entradas − salidas).
 */
export function calcularBalance(movimientos: MovimientoCalc[]): BalanceMensual {
  let entradas = 0;
  let salidas = 0;
  for (const m of movimientos) {
    if (m.tipo === 'entrada') entradas += m.monto_centavos;
    else if (m.tipo === 'salida') salidas += m.monto_centavos;
  }
  return {
    total_entradas_centavos: entradas,
    total_salidas_centavos: salidas,
    balance_centavos: entradas - salidas,
    cantidad: movimientos.length,
  };
}

/**
 * Comisión sobre las entradas, en centavos enteros.
 * `porcentajeComision` legible (5 → 5%).
 */
export function calcularComision(
  centavosEntradas: number,
  porcentajeComision: number
): number {
  return Math.round((centavosEntradas * porcentajeComision) / 100);
}

/**
 * Liquidación para un dueño en un período.
 * Filtra por coincidencia exacta de `dueno` (string).
 */
export function calcularLiquidacionDueno(
  movimientos: MovimientoCalc[],
  dueno: string,
  porcentajeComision: number,
  periodo: { anio: number; mes: number }
): LiquidacionResultado {
  const propios = movimientos.filter((m) => m.dueno === dueno);
  const bal = calcularBalance(propios);
  const comision = calcularComision(bal.total_entradas_centavos, porcentajeComision);
  const neto = bal.total_entradas_centavos - comision - bal.total_salidas_centavos;
  return {
    dueno,
    movimientos: propios.map((m) => ({ ...m })),
    total_entradas_centavos: bal.total_entradas_centavos,
    total_salidas_centavos: bal.total_salidas_centavos,
    comision_centavos: comision,
    neto_dueno_centavos: neto,
    periodo,
  };
}

/** Monto de display (ej. 20.50) → centavos enteros. */
export function aCentavos(montoDisplay: number): number {
  return Math.round(montoDisplay * 100);
}

/** Centavos → número de display. */
export function deCentavos(centavos: number): number {
  return centavos / 100;
}

/** Valida un movimiento parcial antes de persistirlo. */
export function validarMovimiento(m: Partial<MovimientoCalc>): {
  valido: boolean;
  errores: string[];
} {
  const errores: string[] = [];
  if (m.tipo !== 'entrada' && m.tipo !== 'salida') {
    errores.push('tipo debe ser "entrada" o "salida"');
  }
  const monto = m.monto_centavos ?? 0;
  if (!Number.isInteger(monto)) errores.push('monto_centavos debe ser entero');
  if (monto <= 0) errores.push('monto_centavos debe ser > 0');
  if (!m.fecha || Number.isNaN(Date.parse(m.fecha))) {
    errores.push('fecha debe ser un string ISO válido');
  }
  return { valido: errores.length === 0, errores };
}
