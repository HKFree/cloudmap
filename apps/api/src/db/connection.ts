import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Kysely, SqliteDialect } from 'kysely';
import { openNodeSqlite } from './node-sqlite';
import { migrateToLatest } from './migrations';
import type { Database } from './schema';

export type Db = Kysely<Database>;

/**
 * Supported URLs: `sqlite:/data/cloudmap.db`, `sqlite::memory:`.
 * A `mysql://` dialect can be added here later without touching the rest of the code.
 */
export async function openDatabase(url: string): Promise<Db> {
  if (!url.startsWith('sqlite:')) {
    throw new Error(`Nepodporovaná DATABASE_URL: ${url}`);
  }
  const path = url.slice('sqlite:'.length);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: openNodeSqlite(path) }) });
  await migrateToLatest(db);
  return db;
}
