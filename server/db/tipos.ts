/**
 * Kysely table interfaces for the SQLite database.
 *
 * Spanish identifiers for table & column names (ASCII-only — no ñ).
 * All monetary values stored as INTEGER CENTAVOS — zero floating point.
 *
 * Modelo: propiedades / duenos / inquilinos como entidades de primera clase.
 * Movimientos referencia a esos por FK nullable (dueno_id / inquilino_id /
 * propiedad_id). El borrado está RESTRINGIDO desde DB (ON DELETE RESTRICT)
 * y la app debe gestionar el conflicto explícitamente.
 */
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ISO 8601 timestamp stored as TEXT.
type IsoDate = ColumnType<string, string | undefined, string>;
type IsoFecha = ColumnType<string, string, string>;
type JsonText = ColumnType<string | null, string | null | undefined, string | null>;

export type TipoMovimiento = 'entrada' | 'salida';
export type TipoObservacionCaja = 'sobrante' | 'faltante';

// ─── Tabla: propiedades ────────────────────────────────────────────────────
// Ficha "X-YYYY" como identificador natural único. Lo mantenemos también
// como columna explícita (en vez de PK) para conservar autoincrement y
// permitir editar la ficha sin romper FKs.
export interface PropiedadTabla {
  id: Generated<number>;
  ficha: string; // ej. "20-2026"
  creado_en: IsoDate;
  actualizado_en: IsoDate;
}
export type Propiedad = Selectable<PropiedadTabla>;
export type NuevaPropiedad = Insertable<PropiedadTabla>;
export type ActualizacionPropiedad = Updateable<PropiedadTabla>;

// ─── Tabla: duenos ─────────────────────────────────────────────────────────
export interface DuenoTabla {
  id: Generated<number>;
  nombre: string;
  documento: string | null; // opcional; UNIQUE-when-present
  creado_en: IsoDate;
  actualizado_en: IsoDate;
}
export type Dueno = Selectable<DuenoTabla>;
export type NuevoDueno = Insertable<DuenoTabla>;
export type ActualizacionDueno = Updateable<DuenoTabla>;

// ─── Tabla: dueno_propiedades (M:N) ────────────────────────────────────────
export interface DuenoPropiedadTabla {
  dueno_id: number;
  propiedad_id: number;
}
export type DuenoPropiedad = Selectable<DuenoPropiedadTabla>;
export type NuevoDuenoPropiedad = Insertable<DuenoPropiedadTabla>;

// ─── Tabla: inquilinos ─────────────────────────────────────────────────────
export interface InquilinoTabla {
  id: Generated<number>;
  nombre: string;
  documento: string | null; // opcional; UNIQUE-when-present
  propiedad_id: number;     // NOT NULL — inquilino siempre está en una propiedad
  creado_en: IsoDate;
  actualizado_en: IsoDate;
}
export type Inquilino = Selectable<InquilinoTabla>;
export type NuevoInquilino = Insertable<InquilinoTabla>;
export type ActualizacionInquilino = Updateable<InquilinoTabla>;

// ─── Tabla: movimientos ────────────────────────────────────────────────────
// Cada fila representa un movimiento de caja (entrada o salida).
// dueno_id / inquilino_id / propiedad_id son nullables (un gasto bancario
// genérico no requiere ninguna entidad).
export interface MovimientoTabla {
  id: Generated<number>;
  fecha: IsoFecha; // ISO YYYY-MM-DD
  anio: number;
  mes: number;
  tipo: TipoMovimiento;
  monto_centavos: number;
  dueno_id: number | null;
  inquilino_id: number | null;
  propiedad_id: number | null;
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
  propiedades: PropiedadTabla;
  duenos: DuenoTabla;
  dueno_propiedades: DuenoPropiedadTabla;
  inquilinos: InquilinoTabla;
  movimientos: MovimientoTabla;
  meses_facturacion: MesFacturacionTabla;
  observaciones_caja: ObservacionCajaTabla;
  tipo_cambio: TipoCambioTabla;
  configuracion: ConfiguracionTabla;
}
