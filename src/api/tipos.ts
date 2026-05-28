/**
 * DTOs que reflejan las respuestas del servidor. Sincronizado con
 * server/servicios/{movimientos,duenos,inquilinos,propiedades}-util.ts.
 */
export type TipoMovimiento = 'entrada' | 'salida';
export type TipoObservacionCaja = 'sobrante' | 'faltante';

export interface Propiedad {
  id: number;
  ficha: string;
  duenos_ids: number[];
  creado_en: string;
  actualizado_en: string;
}

export interface DuenoPropiedadResumen {
  id: number;
  ficha: string;
}

export interface Dueno {
  id: number;
  nombre: string;
  documento: string | null;
  propiedades: DuenoPropiedadResumen[];
  creado_en: string;
  actualizado_en: string;
}

export interface Inquilino {
  id: number;
  nombre: string;
  documento: string | null;
  propiedad_id: number;
  propiedad_ficha: string;
  creado_en: string;
  actualizado_en: string;
}

export interface Movimiento {
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

export interface EntidadesACrear {
  propiedades: string[];
  duenos: string[];
  inquilinos: string[];
}

export interface VistaPreviaImportacion {
  ok: boolean;
  validas: FilaImportacion[];
  errores: Array<{ rowNumber: number; message: string }>;
  advertencias: Array<{ rowNumber: number; message: string }>;
  total_leidas: number;
  entidades_a_crear: EntidadesACrear;
}

export interface ResultadoConfirmacionImportacion {
  insertadas: number;
  duenos_creados: number;
  inquilinos_creados: number;
  propiedades_creadas: number;
}
