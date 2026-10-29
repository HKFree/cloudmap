import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqliteDatabase, SqliteStatement } from 'kysely';

/**
 * Adapts Node's built-in SQLite to Kysely's SqliteDialect,
 * so the container image needs no native modules.
 */
export function openNodeSqlite(path: string): SqliteDatabase {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
  }

  return {
    close: () => db.close(),
    prepare(sql): SqliteStatement {
      const statement = db.prepare(sql);
      const bind = (params: ReadonlyArray<unknown>) => params as SQLInputValue[];
      return {
        reader: statement.columns().length > 0,
        all: (params) => statement.all(...bind(params)),
        run: (params) => statement.run(...bind(params)),
        iterate: (params) => statement.iterate(...bind(params)),
      };
    },
  };
}
