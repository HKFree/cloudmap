import type { Kysely } from 'kysely';
import type { Revision } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { versionedTables, type NewRow, type VersionedTable } from '../db/schema';

export type Changeset = {
  upsert?: { [T in VersionedTable]?: NewRow<T>[] };
  delete?: { [T in VersionedTable]?: string[] };
};

export type RevisionMeta = { author?: string; message: string };

/**
 * The single write path for map data. Every change creates a revision and
 * keeps `<table>_history` in sync, so any older state of the map can be rebuilt.
 *
 * Upserts run in dependency order and deletes in reverse order, which keeps
 * foreign keys valid when a changeset both re-points and removes rows.
 */
export async function commitChanges(db: Db, meta: RevisionMeta, changes: Changeset): Promise<Revision> {
  return db.transaction().execute(async (trx) => {
    const createdAt = new Date().toISOString();
    const author = meta.author ?? '';
    const inserted = await trx
      .insertInto('revision')
      .values({ created_at: createdAt, author, message: meta.message })
      .executeTakeFirstOrThrow();
    const revisionId = Number(inserted.insertId);

    // Table names are dynamic here; the public Changeset type keeps callers type-safe.
    const tx = trx as unknown as Kysely<any>;

    for (const table of versionedTables) {
      for (const row of changes.upsert?.[table] ?? []) {
        const updated = await tx.updateTable(table).set(row).where('id', '=', row.id).executeTakeFirst();
        if (Number(updated.numUpdatedRows) === 0) {
          await tx.insertInto(table).values(row).execute();
        }
        await closeHistory(tx, table, row.id, revisionId);
        await tx
          .insertInto(`${table}_history`)
          .values({ ...row, valid_from_rev: revisionId, valid_to_rev: null })
          .execute();
      }
    }

    for (const table of [...versionedTables].reverse()) {
      for (const id of changes.delete?.[table] ?? []) {
        await tx.deleteFrom(table).where('id', '=', id).execute();
        await closeHistory(tx, table, id, revisionId);
      }
    }

    return { id: revisionId, createdAt, author, message: meta.message };
  });
}

async function closeHistory(tx: Kysely<any>, table: VersionedTable, id: string, revisionId: number) {
  await tx
    .updateTable(`${table}_history`)
    .set({ valid_to_rev: revisionId })
    .where('id', '=', id)
    .where('valid_to_rev', 'is', null)
    .where('valid_from_rev', '<', revisionId)
    .execute();
}

export async function listRevisions(db: Db): Promise<Revision[]> {
  const rows = await db.selectFrom('revision').selectAll().orderBy('id', 'desc').execute();
  return rows.map(toRevision);
}

export async function getRevision(db: Db, id?: number): Promise<Revision | null> {
  let query = db.selectFrom('revision').selectAll();
  query = id === undefined ? query.orderBy('id', 'desc').limit(1) : query.where('id', '=', id);
  const row = await query.executeTakeFirst();
  return row ? toRevision(row) : null;
}

function toRevision(row: { id: number; created_at: string; author: string; message: string }): Revision {
  return { id: row.id, createdAt: row.created_at, author: row.author, message: row.message };
}
