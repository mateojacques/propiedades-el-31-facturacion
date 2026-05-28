/**
 * Kysely table interfaces for the SQLite database.
 *
 * Spanish identifiers for table & column names (ASCII-only — no ñ).
 * All monetary values stored as INTEGER CENTAVOS — zero floating point.
 * Property / owner / occupant relations dropped: free-text strings.
 */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ISO 8601 timestamp stored as TEXT.
type IsoDate = ColumnType<string, string | undefined, string>;
type IsoFecha = ColumnType<string, string, string>;
type JsonText = ColumnType<string | null, string | null | undefined, string | null>;

export type TipoMovimiento = 'entrada' | 'salida';
export type TipoObservacionCaja = 'sobrante' | 'faltante';

// ─── Tabla: movimientos ────────────────────────────────────────────────────
// Cada fila representa un movimiento de caja (entrada o salida).
export interface MovimientoTabla {
  id: Generated<number>;
  // ISO YYYY-MM-DD. Denormalized anio/mes for fast period filtering.
  fecha: IsoFecha;
  anio: number;
  mes: number;
  tipo: TipoMovimiento;
  monto_centavos: number;
  // Texto libre — sin FKs.
  dueno: string | null;
  inquilino: string | null;
  propiedad: string | null;
  concepto: string;
  detalle: string | null;
  // JSON array of {anio, mes} — months this payment is applied to.
  pagos_de_meses: JsonText;
  mes_facturacion_id: number | null;
  movimiento_original_id: number | null;
  extras: JsonText;
  creado_en: IsoDate;
  actualizado_en: IsoDate;
}
export type Movimiento = Selectable<MovimientoTabla>;
export type NuevoMovimiento = Insertable<MovimientoTabla>;
export type ActualizacionMovimiento = Updateable<MovimientoTabla>;

// ─── Tabla: meses_facturacion ──────────────────────────────────────────────
export interface MesFacturacionTabla {
  id: Generated<number>;
  mes: number;
  anio: number;
  estado: 'borrador' | 'cerrado';
  notas: string | null;
  creado_en: IsoDate;
  actualizado_en: IsoDate;
  cerrado_en: string | null;
}
export type MesFacturacion = Selectable<MesFacturacionTabla>;
export type NuevoMesFacturacion = Insertable<MesFacturacionTabla>;

// ─── Tabla: observaciones_caja ─────────────────────────────────────────────
// Observacion mensual del administrador: sobrante o faltante de caja.
export interface ObservacionCajaTabla {
  id: Generated<number>;
  anio: number;
  mes: number;
  tipo: TipoObservacionCaja;
  monto_centavos: number;
  nota: string | null;
  creado_en: IsoDate;
  actualizado_en: IsoDate;
}
export type ObservacionCaja = Selectable<ObservacionCajaTabla>;
export type NuevoObservacionCaja = Insertable<ObservacionCajaTabla>;
export type ActualizacionObservacionCaja = Updateable<ObservacionCajaTabla>;

// ─── Tabla: tipo_cambio ────────────────────────────────────────────────────
export interface TipoCambioTabla {
  id: Generated<number>;
  ars_por_usd: number;
  actualizado_en: IsoDate;
}
export type TipoCambio = Selectable<TipoCambioTabla>;

// ─── Tabla: configuracion ──────────────────────────────────────────────────
export interface ConfiguracionTabla {
  clave: string; // PK
  valor: string;
  actualizado_en: IsoDate;
}
export type Configuracion = Selectable<ConfiguracionTabla>;

export interface Database {
  movimientos: MovimientoTabla;
  meses_facturacion: MesFacturacionTabla;
  observaciones_caja: ObservacionCajaTabla;
  tipo_cambio: TipoCambioTabla;
  configuracion: ConfiguracionTabla;
}
