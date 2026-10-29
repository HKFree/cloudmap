import { ulid } from 'ulid';
import type { Revision } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { versionedTables, type VersionedTable } from '../db/schema';
import { labelRow, linkPointRows, linkRow, linkTypeRow, nodeRow, nodeTypeRow } from '../repo/map';
import { commitChanges, type Changeset } from '../repo/revisions';
import { convertDia, type ImportReport } from './convert';
import { parseDia } from './parse';

export interface ImportOptions {
  /** Replace an existing map; otherwise importing into a non-empty database fails. */
  replace?: boolean;
  message?: string;
}

export async function importDia(db: Db, xml: string, options: ImportOptions = {}): Promise<{ revision: Revision; report: ImportReport }> {
  const { map, report } = convertDia(parseDia(xml), ulid);

  const existing = await existingIds(db);
  const hasData = Object.values(existing).some((ids) => ids.length > 0);
  if (hasData && !options.replace) {
    throw new Error('Databáze už obsahuje mapu. Pro přepsání použijte --replace.');
  }

  const changes: Changeset = {
    upsert: {
      link_type: map.linkTypes.map(linkTypeRow),
      node_type: map.nodeTypes.map(nodeTypeRow),
      node: map.nodes.map(nodeRow),
      link: map.links.map(linkRow),
      link_point: map.links.flatMap(linkPointRows),
      label: map.labels.map(labelRow),
    },
    delete: existing,
  };
  // Node types have fixed ids and are updated in place rather than deleted.
  changes.delete!.node_type = existing.node_type.filter((id) => !map.nodeTypes.some((t) => t.id === id));

  const revision = await commitChanges(db, { message: options.message ?? 'Import z Dia diagramu' }, changes);
  return { revision, report };
}

async function existingIds(db: Db): Promise<Record<VersionedTable, string[]>> {
  const result = {} as Record<VersionedTable, string[]>;
  for (const table of versionedTables) {
    const rows = await db.selectFrom(table).select('id').execute();
    result[table] = rows.map((r) => r.id);
  }
  return result;
}
