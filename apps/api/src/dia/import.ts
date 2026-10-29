import type { Revision } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { versionedTables, type NewRow, type VersionedTable } from '../db/schema';
import { labelRow, linkPointRows, linkRow, linkTypeRow, nodeRow, nodeTypeRow, readTable } from '../repo/map';
import { stableJson } from '../repo/changes';
import { commitChanges, type Changeset } from '../repo/revisions';
import { convertDia, type ImportReport } from './convert';
import { parseDia } from './parse';

export interface ImportOptions {
  /** Replace an existing map; otherwise importing into a non-empty database fails. */
  replace?: boolean;
  message?: string;
}

/** Returns `revision: null` when the map already matches the diagram. */
export async function importDia(db: Db, xml: string, options: ImportOptions = {}): Promise<{ revision: Revision | null; report: ImportReport }> {
  const { map, report } = convertDia(parseDia(xml));

  const existing = await existingRows(db);
  const hasData = Object.values(existing).some((rows) => rows.size > 0);
  if (hasData && !options.replace) {
    throw new Error('Databáze už obsahuje mapu. Pro přepsání použij --replace.');
  }

  const rows: { [T in VersionedTable]: NewRow<T>[] } = {
    link_type: map.linkTypes.map(linkTypeRow),
    node_type: map.nodeTypes.map(nodeTypeRow),
    node: map.nodes.map(nodeRow),
    link: map.links.map(linkRow),
    link_point: map.links.flatMap(linkPointRows),
    label: map.labels.map(labelRow),
  };

  // Ids derive from names, so a repeated import touches only what really differs.
  const changes: Required<Changeset> = { upsert: {}, delete: {} };
  for (const table of versionedTables) {
    const current = existing[table];
    const imported = new Set(rows[table].map((row) => row.id));
    (changes.upsert as Record<string, unknown>)[table] = rows[table].filter((row) => current.get(row.id) !== stableJson(row));
    changes.delete[table] = [...current.keys()].filter((id) => !imported.has(id));
  }

  const changed = versionedTables.some((t) => changes.upsert[t]!.length > 0 || changes.delete[t]!.length > 0);
  if (!changed) return { revision: null, report };

  const revision = await commitChanges(db, { message: options.message ?? 'Import z Dia diagramu', author: 'import' }, changes);
  return { revision, report };
}

async function existingRows(db: Db): Promise<Record<VersionedTable, Map<string, string>>> {
  const result = {} as Record<VersionedTable, Map<string, string>>;
  for (const table of versionedTables) {
    const rows = await readTable(db, table);
    result[table] = new Map(rows.map((row) => [row.id, stableJson(row)]));
  }
  return result;
}
