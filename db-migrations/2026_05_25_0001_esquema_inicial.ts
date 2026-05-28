/**
 * Initial schema.
 * Monetary values: integer centavos (no floats).
 * Spanish table/column names; ASCII-only (no ñ) for tooling safety.
 *
 * Entidades:
 *   propiedades         — ficha "X-YYYY", unique
 *   duenos              — persona (M:N propiedades vía dueno_propiedades)
 *   dueno_propiedades   — join table M:N
 *   inquilinos          — persona N:1 propiedad
 *   movimientos         — caja con FKs nullables a dueno/inquilino/propiedad
 *   observaciones_caja  — sobrante/faltante mensual (UNIQUE anio,mes)
 *   meses_facturacion   — placeholder para cierre mensual
 *   tipo_cambio         — singleton ARS/USD
 *   configuracion       — key/value (PIN, etc.)
 *
 * Borrado de dueno/inquilino/propiedad referenciado por movimientos:
 * `ON DELETE RESTRICT` — el backend rechaza explícitamente y le pide al
 * usuario borrar primero los movimientos.
 *
 * Documento: opcional. UNIQUE solo cuando presente (partial unique index).
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // ── propiedades ──────────────────────────────────────────────────────────
  await db.schema
    .createTable('propiedades')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('ficha', 'text', (c) =>
      c.notNull().check(sql`ficha GLOB '[1-9]*-[12][0-9][0-9][0-9]'`)
    )
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db.schema
    .createIndex('idx_propiedades_ficha')
    .on('propiedades')
    .column('ficha')
    .unique()
    .execute();

  // ── duenos ───────────────────────────────────────────────────────────────
  await db.schema
    .createTable('duenos')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('nombre', 'text', (c) => c.notNull())
    .addColumn('documento', 'text') // opcional
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db.schema.createIndex('idx_duenos_nombre').on('duenos').column('nombre').execute();
  // Documento UNIQUE solo cuando presente (partial unique index).
  await sql`CREATE UNIQUE INDEX idx_duenos_documento_unq ON duenos(documento) WHERE documento IS NOT NULL`.execute(db);

  // ── dueno_propiedades (M:N) ──────────────────────────────────────────────
  await db.schema
    .createTable('dueno_propiedades')
    .addColumn('dueno_id', 'integer', (c) => c.notNull().references('duenos.id').onDelete('cascade'))
    .addColumn('propiedad_id', 'integer', (c) =>
      c.notNull().references('propiedades.id').onDelete('cascade')
    )
    .addPrimaryKeyConstraint('pk_dueno_propiedades', ['dueno_id', 'propiedad_id'])
    .execute();

  await db.schema
    .createIndex('idx_dueno_propiedades_propiedad')
    .on('dueno_propiedades')
    .column('propiedad_id')
    .execute();

  // ── inquilinos ───────────────────────────────────────────────────────────
  await db.schema
    .createTable('inquilinos')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('nombre', 'text', (c) => c.notNull())
    .addColumn('documento', 'text') // opcional
    .addColumn('propiedad_id', 'integer', (c) =>
      c.notNull().references('propiedades.id').onDelete('restrict')
    )
    .addColumn('creado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .addColumn('actualizado_en', 'text', (c) => c.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`))
    .execute();

  await db.schema.createIndex('idx_inquilinos_nombre').on('inquilinos').column('nombre').execute();
  await db.schema.createIndex('idx_inquilinos_propiedad').on('inquilinos').column('propiedad_id').execute();
  await sql`CREATE UNIQUE INDEX idx_inquilinos_documento_unq ON inquilinos(documento) WHERE documento IS NOT NULL`.execute(db);

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
  // dueno_id / inquilino_id / propiedad_id son FKs nullables.
  // ON DELETE RESTRICT en los tres: forzar limpieza explícita desde la app.
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
    .addColumn('dueno_id', 'integer', (c) => c.references('duenos.id').onDelete('restrict'))
    .addColumn('inquilino_id', 'integer', (c) => c.references('inquilinos.id').onDelete('restrict'))
    .addColumn('propiedad_id', 'integer', (c) => c.references('propiedades.id').onDelete('restrict'))
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
  await db.schema.createIndex('idx_movimientos_dueno').on('movimientos').column('dueno_id').execute();
  await db.schema.createIndex('idx_movimientos_inquilino').on('movimientos').column('inquilino_id').execute();
  await db.schema.createIndex('idx_movimientos_propiedad').on('movimientos').column('propiedad_id').execute();
  await db.schema.createIndex('idx_movimientos_fecha').on('movimientos').column('fecha').execute();
  await db.schema.createIndex('idx_movimientos_tipo').on('movimientos').column('tipo').execute();

  // ── observaciones_caja ───────────────────────────────────────────────────
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
  await db.schema.dropTable('inquilinos').execute();
  await db.schema.dropTable('dueno_propiedades').execute();
  await db.schema.dropTable('duenos').execute();
  await db.schema.dropTable('propiedades').execute();
}
