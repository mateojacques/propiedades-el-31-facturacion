/**
 * Helpers compartidos por rutas de movimientos.
 *
 * El DTO público incluye dueno_id/inquilino_id/propiedad_id (FKs) y,
 * por conveniencia para la UI, los nombres ya resueltos (vía LEFT JOIN
 * que cada ruta hace al consultar). Si la ruta no joinea, los campos
 * "*_nombre"/"propiedad_ficha" quedan en null.
 */
import type { Movimiento, TipoMovimiento } from '../db/tipos';

export interface MovimientoDTO {
  id: number;
  fecha: string;
  anio: number;
  mes: number;
  tipo: TipoMovimiento;
  monto_centavos: number;
  dueno_id: number | null;
  dueno_nombre: string | null;
  inquilino_id: number | null;
  inquilino_nombre: string | null;
  propiedad_id: number | null;
  propiedad_ficha: string | null;
  concepto: string;
  detalle: string | null;
  pagos_de_meses: Array<{ anio: number; mes: number }>;
  mes_facturacion_id: number | null;
  movimiento_original_id: number | null;
  extras: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
}

/**
 * Forma "enriquecida" de la fila esperada: una `Movimiento` cruda + los
 * nombres opcionales venidos del JOIN. Usamos un tipo permisivo para evitar
 * arrastrar genéricos de Kysely.
 */
export interface MovimientoConJoins extends Movimiento {
  dueno_nombre?: string | null;
  inquilino_nombre?: string | null;
  propiedad_ficha?: string | null;
}

const parseJsonOrNull = <T>(s: string | null): T | null => {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
};

export function movimientoAFila(m: MovimientoConJoins): MovimientoDTO {
  return {
    id: m.id,
    fecha: m.fecha,
    anio: m.anio,
    mes: m.mes,
    tipo: m.tipo,
    monto_centavos: m.monto_centavos,
    dueno_id: m.dueno_id,
    dueno_nombre: m.dueno_nombre ?? null,
    inquilino_id: m.inquilino_id,
    inquilino_nombre: m.inquilino_nombre ?? null,
    propiedad_id: m.propiedad_id,
    propiedad_ficha: m.propiedad_ficha ?? null,
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
