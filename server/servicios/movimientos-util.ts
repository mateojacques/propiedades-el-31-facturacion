/**
 * Helpers compartidos por rutas de movimientos.
 */
import type { Movimiento, TipoMovimiento } from '../db/tipos';

export interface MovimientoDTO {
  id: number;
  fecha: string;
  anio: number;
  mes: number;
  tipo: TipoMovimiento;
  monto_centavos: number;
  dueno: string | null;
  inquilino: string | null;
  propiedad: string | null;
  concepto: string;
  detalle: string | null;
  pagos_de_meses: Array<{ anio: number; mes: number }>;
  mes_facturacion_id: number | null;
  movimiento_original_id: number | null;
  extras: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
}

const parseJsonOrNull = <T>(s: string | null): T | null => {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
};

export function movimientoAFila(m: Movimiento): MovimientoDTO {
  return {
    id: m.id,
    fecha: m.fecha,
    anio: m.anio,
    mes: m.mes,
    tipo: m.tipo,
    monto_centavos: m.monto_centavos,
    dueno: m.dueno,
    inquilino: m.inquilino,
    propiedad: m.propiedad,
    concepto: m.concepto,
    detalle: m.detalle,
    pagos_de_meses: parseJsonOrNull<Array<{ anio: number; mes: number }>>(m.pagos_de_meses) ?? [],
    mes_facturacion_id: m.mes_facturacion_id,
    movimiento_original_id: m.movimiento_original_id,
    extras: parseJsonOrNull<Record<string, unknown>>(m.extras),
    creado_en: m.creado_en,
    actualizado_en: m.actualizado_en,
  };
}
