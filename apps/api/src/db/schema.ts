import type { Generated, Insertable, Selectable } from 'kysely';

export interface RevisionTable {
  id: Generated<number>;
  created_at: string;
  author: string;
  message: string;
}

export interface LinkTypeTable {
  id: string;
  name: string;
  color: string;
  width: number;
  dash: string;
  description: string;
  sort_order: number;
}

export interface NodeTypeTable {
  id: string;
  name: string;
  shape: string;
  fill_color: string | null;
  stroke_color: string;
  is_area: number;
  description: string;
  sort_order: number;
}

export interface NodeTable {
  id: string;
  type_id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  label_dx: number;
  label_dy: number;
  note: string;
}

export interface LinkTable {
  id: string;
  type_id: string;
  from_node_id: string;
  to_node_id: string;
  shape: string;
  curvature: number;
  capacity: string;
  label_x: number | null;
  label_y: number | null;
  note: string;
}

export interface LinkPointTable {
  id: string;
  link_id: string;
  seq: number;
  x: number;
  y: number;
}

export interface LabelTable {
  id: string;
  text: string;
  x: number;
  y: number;
  font_size: number;
  bold: number;
  color: string;
  align: string;
}

export interface HistoryColumns {
  valid_from_rev: number;
  valid_to_rev: number | null;
}

/** Versioned tables in dependency order: referenced tables come first. */
export const versionedTables = ['link_type', 'node_type', 'node', 'link', 'link_point', 'label'] as const;
export type VersionedTable = (typeof versionedTables)[number];

export interface VersionedRows {
  link_type: LinkTypeTable;
  node_type: NodeTypeTable;
  node: NodeTable;
  link: LinkTable;
  link_point: LinkPointTable;
  label: LabelTable;
}

export type HistoryTables = {
  [T in VersionedTable as `${T}_history`]: VersionedRows[T] & HistoryColumns;
};

export type Database = VersionedRows & HistoryTables & { revision: RevisionTable };

export type Row<T extends VersionedTable> = Selectable<VersionedRows[T]>;
export type NewRow<T extends VersionedTable> = Insertable<VersionedRows[T]>;
