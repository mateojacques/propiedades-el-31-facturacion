/**
 * Kysely migration runner.
 *
 * Migration files live in `db-migrations/` at the project root in dev, and
 * are copied into the asar bundle at the same relative path in production.
 * Each file exports async `up(db)` and (optionally) `down(db)`.
 */
import { Migrator, FileMigrationProvider } from 'kysely';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { DbHandle } from './conexion';

/**
 * Resolves to the compiled `db-migrations/` folder produced by
 * `tsconfig.electron.json` (which compiles `.ts` → `.js`).
 *
 * In packaged builds: <app.asar>/dist-electron/db-migrations/
 * In dev/typecheck builds: <projectRoot>/dist-electron/db-migrations/
 * Both are reached identically via __dirname-relative resolution.
 */
function resolveMigrationsFolder(): string {
  // migrador.js lives at dist-electron/server/db/migrador.js,
  // so '../../db-migrations' = dist-electron/db-migrations.
  return path.resolve(__dirname, '..', '..', 'db-migrations');
}

export async function runMigrations(db: DbHandle): Promise<void> {
  const migrationFolder = resolveMigrationsFolder();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder,
    }),
  });

  const { error, results } = await migrator.migrateToLatest();
  if (results) {
    for (const r of results) {
      if (r.status === 'Error') {
        // eslint-disable-next-line no-console
        console.error(`[migración fallida] ${r.migrationName}`);
      }
    }
  }
  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
