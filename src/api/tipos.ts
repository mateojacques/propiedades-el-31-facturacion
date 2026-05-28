/**
 * DTOs que reflejan las respuestas del servidor. Sincronizado con
 * server/servicios/movimientos-util.ts, observaciones-caja y rutas.
 */
export type TipoMovimiento = 'entrada' | 'salida';
export type TipoObservacionCaja = 'sobrante' | 'faltante';

export interface Movimiento {
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

export interface Paginacion {
  pagina: number;
  por_pagina: number;
  total: number;
  paginas: number;
}

export interface ListaMovimientos {
  data: Movimiento[];
  paginacion: Paginacion;
}

export interface BalanceMensual {
  anio: number;
  mes: number;
  total_entradas_centavos: number;
  total_salidas_centavos: number;
  balance_centavos: number;
  cantidad: number;
}

export interface ObservacionCaja {
  id: number;
  anio: number;
  mes: number;
  tipo: TipoObservacionCaja;
  monto_centavos: number;
  nota: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface TipoCambio {
  id: number;
  ars_por_usd: number;
  actualizado_en: string | null;
}

export interface FilaImportacion {
  rowNumber: number;
  date: string;
  rawDate: string;
  duenoName: string;
  propertyFileNumber: string;
  inquilinoName: string;
  tipo: TipoMovimiento | null;
  montoCentavos: number;
  paymentForMonths: Array<{ anio: number; mes: number }>;
  parseErrors: string[];
}

export interface VistaPreviaImportacion {
  ok: boolean;
  validas: FilaImportacion[];
  errores: Array<{ rowNumber: number; message: string }>;
  advertencias: Array<{ rowNumber: number; message: string }>;
  total_leidas: number;
}
