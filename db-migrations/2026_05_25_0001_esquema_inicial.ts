/**
 * Initial schema.
 * Monetary values: integer centavos (no floats).
 * Spanish table/column names; ASCII-only (no ñ) for tooling safety.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // ── meses_facturacion ────────────────────────────────────────────────────
  await db.schema
    .createTable('meses_facturacion')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('mes', 'integer', (c) => c.notNull())
    .addColumn('anio', 'integer', (c) => c.notNull())
    .addColumn('estado', 'text', (c) => c.notNull().defaultTo('borrador'))
    .addColumn('notas', 'text')
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('cerrado_en', 'text')
    .execute();

  await db.schema
    .createIndex('idx_meses_periodo')
    .on('meses_facturacion')
    .columns(['anio', 'mes'])
    .unique()
    .execute();

  // ── movimientos ──────────────────────────────────────────────────────────
  // Cada fila es un movimiento de caja: tipo "entrada" o "salida".
  // Asociado a propiedad / dueno / inquilino como texto libre.
  await db.schema
    .createTable('movimientos')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('fecha', 'text', (c) => c.notNull())
    .addColumn('anio', 'integer', (c) => c.notNull())
    .addColumn('mes', 'integer', (c) => c.notNull())
    .addColumn('tipo', 'text', (c) =>
      c.notNull().check(sql`tipo in ('entrada','salida')`)
    )
    .addColumn('monto_centavos', 'integer', (c) =>
      c.notNull().check(sql`monto_centavos >= 0`)
    )
    .addColumn('dueno', 'text')
    .addColumn('inquilino', 'text')
    .addColumn('propiedad', 'text')
    .addColumn('concepto', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('detalle', 'text')
    .addColumn('pagos_de_meses', 'text')
    .addColumn('mes_facturacion_id', 'integer', (c) =>
      c.references('meses_facturacion.id').onDelete('set null')
    )
    .addColumn('movimiento_original_id', 'integer', (c) =>
      c.references('movimientos.id').onDelete('set null')
    )
    .addColumn('extras', 'text')
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db.schema.createIndex('idx_movimientos_periodo').on('movimientos').columns(['anio', 'mes']).execute();
  await db.schema.createIndex('idx_movimientos_dueno').on('movimientos').column('dueno').execute();
  await db.schema.createIndex('idx_movimientos_fecha').on('movimientos').column('fecha').execute();
  await db.schema.createIndex('idx_movimientos_tipo').on('movimientos').column('tipo').execute();

  // ── observaciones_caja ───────────────────────────────────────────────────
  // Observacion mensual del administrador: sobrante o faltante de caja.
  // Una sola observacion por (anio, mes).
  await db.schema
    .createTable('observaciones_caja')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('anio', 'integer', (c) => c.notNull())
    .addColumn('mes', 'integer', (c) => c.notNull())
    .addColumn('tipo', 'text', (c) =>
      c.notNull().check(sql`tipo in ('sobrante','faltante')`)
    )
    .addColumn('monto_centavos', 'integer', (c) =>
      c.notNull().check(sql`monto_centavos >= 0`)
    )
    .addColumn('nota', 'text')
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db.schema
    .createIndex('idx_observaciones_periodo')
    .on('observaciones_caja')
    .columns(['anio', 'mes'])
    .unique()
    .execute();

  // ── tipo_cambio (singleton) ─────────────────────────────────────────────
  await db.schema
    .createTable('tipo_cambio')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('ars_por_usd', 'real', (c) => c.notNull())
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  // ── configuracion (key/value) ───────────────────────────────────────────
  await db.schema
    .createTable('configuracion')
    .addColumn('clave', 'text', (c) => c.primaryKey())
    .addColumn('valor', 'text', (c) => c.notNull())
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db
    .insertInto('tipo_cambio')
    .values({ id: 1, ars_por_usd: 1000 })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('configuracion').execute();
  await db.schema.dropTable('tipo_cambio').execute();
  await db.schema.dropTable('observaciones_caja').execute();
  await db.schema.dropTable('movimientos').execute();
  await db.schema.dropTable('meses_facturacion').execute();
}
