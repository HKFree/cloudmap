import type { MapChanges, Revision } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { versionedTables, type NewRow, type VersionedTable } from '../db/schema';
import { labelRow, linkPointRows, linkRow, linkTypeRow, nodeRow, nodeTypeRow, readTable } from './map';
import { commitChanges, getRevision, type Changeset } from './revisions';

export class ValidationError extends Error {}

export interface SaveInput extends MapChanges {
  baseRevisionId: number | null;
  message: string;
  author: string;
}

const DEFAULT_MESSAGE = 'Úprava mapy';

/** Applies changes made in the editor as one new revision. */
export async function saveChanges(db: Db, input: SaveInput): Promise<Revision> {
  for (const link of input.upsert.links) {
    if (link.fromNodeId === link.toNodeId) throw new ValidationError('Spoj nemůže vést z uzlu do téhož uzlu.');
  }

  return withForeignKeyErrors(() =>
    commitChanges(
      db,
      { message: input.message.trim() || DEFAULT_MESSAGE, author: input.author, expectedRevisionId: input.baseRevisionId },
      async (trx) => {
        const { upsert, delete: remove } = input;
        const changedLinkIds = [...upsert.links.map((l) => l.id), ...remove.links];
        const newPointIds = new Set(upsert.links.flatMap(linkPointRows).map((p) => p.id));
        const stalePoints = changedLinkIds.length
          ? await trx.selectFrom('link_point').select('id').where('link_id', 'in', changedLinkIds).execute()
          : [];

        return {
          upsert: {
            link_type: upsert.linkTypes.map(linkTypeRow),
            node_type: upsert.nodeTypes.map(nodeTypeRow),
            node: upsert.nodes.map(nodeRow),
            link: upsert.links.map(linkRow),
            link_point: upsert.links.flatMap(linkPointRows),
            label: upsert.labels.map(labelRow),
          },
          delete: {
            link_type: remove.linkTypes,
            node_type: remove.nodeTypes,
            node: remove.nodes,
            link: remove.links,
            link_point: stalePoints.map((p) => p.id).filter((id) => !newPointIds.has(id)),
            label: remove.labels,
          },
        };
      },
    ),
  );
}

/** Creates a new revision whose content equals the map right after revision `revisionId`. */
export async function restoreRevision(db: Db, revisionId: number, message: string): Promise<Revision | null> {
  if (!(await getRevision(db, revisionId))) return null;

  return withForeignKeyErrors(() =>
    commitChanges(db, { message: message.trim() || `Obnovení revize #${revisionId}` }, async (trx) => {
      const changeset: Required<Changeset> = { upsert: {}, delete: {} };
      for (const table of versionedTables) {
        const [past, current] = await Promise.all([readTable(trx, table, revisionId), readTable(trx, table)]);
        const currentById = new Map(current.map((row) => [row.id, stableJson(row)]));
        const pastRows = past.map(withoutHistoryColumns);
        const pastIds = new Set(pastRows.map((row) => row.id));
        setRows(changeset, table, pastRows.filter((row) => currentById.get(row.id) !== stableJson(row)));
        changeset.delete[table] = current.filter((row) => !pastIds.has(row.id)).map((row) => row.id);
      }
      return changeset;
    }),
  );
}

function setRows<T extends VersionedTable>(changeset: Required<Changeset>, table: T, rows: NewRow<T>[]) {
  (changeset.upsert as Record<string, unknown>)[table] = rows;
}

/** Column order differs between live and history tables, so compare with sorted keys. */
const stableJson = (row: object) => JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)));

function withoutHistoryColumns<T extends { id: string }>(row: T): T {
  const { valid_from_rev: _from, valid_to_rev: _to, ...rest } = row as T & Record<string, unknown>;
  return rest as unknown as T;
}

async function withForeignKeyErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && /foreign key/i.test(error.message)) {
      throw new ValidationError('Změna porušuje vazby mezi daty (např. mazaný typ nebo uzel se stále používá).');
    }
    throw error;
  }
}

