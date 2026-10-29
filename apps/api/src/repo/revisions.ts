import type { Kysely, Transaction } from 'kysely';
import type { ChangeCounts, Revision, RevisionSummary } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { versionedTables, type Database, type NewRow, type VersionedTable } from '../db/schema';

export type Changeset = {
  upsert?: { [T in VersionedTable]?: NewRow<T>[] };
  delete?: { [T in VersionedTable]?: string[] };
};

export interface CommitOptions {
  author?: string;
  message: string;
  /** Fails with ConflictError when the latest revision differs (optimistic locking). */
  expectedRevisionId?: number | null;
}

export class ConflictError extends Error {}

/**
 * The single write path for map data. Every change creates a revision and
 * keeps `<table>_history` in sync, so any older state of the map can be rebuilt.
 *
 * Upserts run in dependency order and deletes in reverse order, which keeps
 * foreign keys valid when a changeset both re-points and removes rows.
 * `changes` may be a function, so it is computed inside the same transaction.
 */
export async function commitChanges(
  db: Db,
  options: CommitOptions,
  changes: Changeset | ((trx: Transaction<Database>) => Promise<Changeset>),
): Promise<Revision> {
  return db.transaction().execute(async (trx) => {
    if (options.expectedRevisionId !== undefined) {
      const latest = await getRevision(trx);
      if ((latest?.id ?? null) !== options.expectedRevisionId) {
        throw new ConflictError('Mapu mezitím změnil někdo jiný. Načtěte ji znovu a změny zopakujte.');
      }
    }
    const changeset = typeof changes === 'function' ? await changes(trx) : changes;

    const createdAt = new Date().toISOString();
    const author = options.author ?? '';
    const inserted = await trx
      .insertInto('revision')
      .values({ created_at: createdAt, author, message: options.message })
      .executeTakeFirstOrThrow();
    const revisionId = Number(inserted.insertId);

    // Table names are dynamic here; the public Changeset type keeps callers type-safe.
    const tx = trx as unknown as Kysely<any>;

    for (const table of versionedTables) {
      for (const row of changeset.upsert?.[table] ?? []) {
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
      for (const id of changeset.delete?.[table] ?? []) {
        await tx.deleteFrom(table).where('id', '=', id).execute();
        await closeHistory(tx, table, id, revisionId);
      }
    }

    return { id: revisionId, createdAt, author, message: options.message };
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

export async function getRevision(db: Kysely<Database>, id?: number): Promise<Revision | null> {
  let query = db.selectFrom('revision').selectAll();
  query = id === undefined ? query.orderBy('id', 'desc').limit(1) : query.where('id', '=', id);
  const row = await query.executeTakeFirst();
  return row ? toRevision(row) : null;
}

const summaryTables = {
  linkTypes: 'link_type',
  nodeTypes: 'node_type',
  nodes: 'node',
  links: 'link',
  labels: 'label',
} as const satisfies Record<keyof RevisionSummary['changes'], VersionedTable>;

/**
 * Revisions with counts of added, changed and deleted items, derived from history:
 * a row starting at revision N is "changed" when the same id has a row ending at N.
 */
export async function listRevisions(db: Db): Promise<RevisionSummary[]> {
  const rows = await db.selectFrom('revision').selectAll().orderBy('id', 'desc').execute();
  const kdb = db as unknown as Kysely<any>;

  const countsByTable = await Promise.all(
    Object.values(summaryTables).map(async (table) => {
      const history = `${table}_history`;
      const [started, ended, replaced] = await Promise.all([
        kdb.selectFrom(history).select(['valid_from_rev as rev', (eb) => eb.fn.countAll().as('n')]).groupBy('valid_from_rev').execute(),
        kdb
          .selectFrom(history)
          .select(['valid_to_rev as rev', (eb) => eb.fn.countAll().as('n')])
          .where('valid_to_rev', 'is not', null)
          .groupBy('valid_to_rev')
          .execute(),
        kdb
          .selectFrom(`${history} as old`)
          .innerJoin(`${history} as new`, (join) =>
            join.onRef('old.id', '=', 'new.id').onRef('old.valid_to_rev', '=', 'new.valid_from_rev'),
          )
          .select(['new.valid_from_rev as rev', (eb) => eb.fn.countAll().as('n')])
          .groupBy('new.valid_from_rev')
          .execute(),
      ]);
      const toMap = (list: { rev: number; n: unknown }[]) => new Map(list.map((r) => [Number(r.rev), Number(r.n)]));
      return { started: toMap(started), ended: toMap(ended), replaced: toMap(replaced) };
    }),
  );

  const keys = Object.keys(summaryTables) as (keyof RevisionSummary['changes'])[];
  return rows.map((row) => {
    const changes = {} as RevisionSummary['changes'];
    keys.forEach((key, i) => {
      const { started, ended, replaced } = countsByTable[i]!;
      const changed = replaced.get(row.id) ?? 0;
      const counts: ChangeCounts = {
        added: (started.get(row.id) ?? 0) - changed,
        changed,
        deleted: (ended.get(row.id) ?? 0) - changed,
      };
      changes[key] = counts;
    });
    return { ...toRevision(row), changes };
  });
}

function toRevision(row: { id: number; created_at: string; author: string; message: string }): Revision {
  return { id: row.id, createdAt: row.created_at, author: row.author, message: row.message };
}
