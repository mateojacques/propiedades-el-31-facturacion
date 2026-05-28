/**
 * SQLite + Kysely connection.
 *
 * Opens better-sqlite3 with the recommended pragmas (WAL, foreign keys,
 * busy_timeout) and wraps it in a typed Kysely instance.
 */
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, ParseJSONResultsPlugin } from 'kysely';
import path from 'node:path';
import fs from 'node:fs';
import type { Database as DB } from './tipos';

export type DbHandle = Kysely<DB>;

export interface OpenDbOptions {
  /** Absolute path to the userData directory (e.g. %APPDATA%\PropiedadesEl31Facturacion). */
  userDataPath: string;
}

export function openDatabase({ userDataPath }: OpenDbOptions): { db: DbHandle; raw: Database.Database; dbPath: string } {
  const datosDir = path.join(userDataPath, 'datos');
  fs.mkdirSync(datosDir, { recursive: true });
  const dbPath = path.join(datosDir, 'facturacion.db');

  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('synchronous = NORMAL');
  raw.pragma('busy_timeout = 5000');

  const db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: raw }),
    plugins: [new ParseJSONResultsPlugin()],
  });

  return { db, raw, dbPath };
}
