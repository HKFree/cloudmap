import type { Kysely } from 'kysely';
import type {
  LabelAlign,
  LinkShape,
  LinkType,
  MapData,
  MapLabel,
  MapLink,
  MapNode,
  NodeShape,
  NodeType,
} from '@cloudmap/shared';
import type { Db } from '../db/connection';
import type { NewRow, Row, VersionedTable } from '../db/schema';
import { getRevision } from './revisions';

/** Loads the current map, or the map as it was right after revision `revisionId`. */
export async function loadMap(db: Db, revisionId?: number): Promise<MapData | null> {
  const revision = await getRevision(db, revisionId);
  if (revisionId !== undefined && !revision) return null;

  const read = <T extends VersionedTable>(table: T) => readTable(db, table, revisionId);
  const [linkTypes, nodeTypes, nodes, links, points, labels] = await Promise.all([
    read('link_type'),
    read('node_type'),
    read('node'),
    read('link'),
    read('link_point'),
    read('label'),
  ]);

  const pointsByLink = new Map<string, Row<'link_point'>[]>();
  for (const point of points) {
    const list = pointsByLink.get(point.link_id) ?? [];
    list.push(point);
    pointsByLink.set(point.link_id, list);
  }

  return {
    revision,
    linkTypes: linkTypes.map(toLinkType).sort(bySortOrder),
    nodeTypes: nodeTypes.map(toNodeType).sort(bySortOrder),
    nodes: nodes.map(toNode),
    links: links.map((link) => toLink(link, pointsByLink.get(link.id) ?? [])),
    labels: labels.map(toLabel),
  };
}

export async function readTable<T extends VersionedTable>(db: Db, table: T, revisionId?: number): Promise<Row<T>[]> {
  const kdb = db as unknown as Kysely<any>;
  if (revisionId === undefined) {
    return kdb.selectFrom(table).selectAll().orderBy('id').execute() as Promise<Row<T>[]>;
  }
  return kdb
    .selectFrom(`${table}_history`)
    .selectAll()
    .where('valid_from_rev', '<=', revisionId)
    .where((eb) => eb.or([eb('valid_to_rev', 'is', null), eb('valid_to_rev', '>', revisionId)]))
    .orderBy('id')
    .execute() as Promise<Row<T>[]>;
}

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

const toLinkType = (r: Row<'link_type'>): LinkType => ({
  id: r.id,
  name: r.name,
  color: r.color,
  width: r.width,
  dash: r.dash,
  description: r.description,
  sortOrder: r.sort_order,
  remote: Boolean(r.remote),
});

const toNodeType = (r: Row<'node_type'>): NodeType => ({
  id: r.id,
  name: r.name,
  shape: r.shape as NodeShape,
  fillColor: r.fill_color,
  strokeColor: r.stroke_color,
  isArea: Boolean(r.is_area),
  description: r.description,
  sortOrder: r.sort_order,
});

const toNode = (r: Row<'node'>): MapNode => ({
  id: r.id,
  typeId: r.type_id,
  label: r.label,
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  fontSize: r.font_size,
  labelDx: r.label_dx,
  labelDy: r.label_dy,
  note: r.note,
});

const toLink = (r: Row<'link'>, points: Row<'link_point'>[]): MapLink => ({
  id: r.id,
  typeId: r.type_id,
  fromNodeId: r.from_node_id,
  toNodeId: r.to_node_id === r.from_node_id ? null : r.to_node_id,
  shape: r.shape as LinkShape,
  curvature: r.curvature,
  points: points.sort((a, b) => a.seq - b.seq).map(({ x, y }) => ({ x, y })),
  cornerRadius: r.corner_radius,
  capacity: r.capacity,
  peer: r.peer,
  labelX: r.label_x,
  labelY: r.label_y,
  note: r.note,
});

const toLabel = (r: Row<'label'>): MapLabel => ({
  id: r.id,
  text: r.text,
  x: r.x,
  y: r.y,
  fontSize: r.font_size,
  bold: Boolean(r.bold),
  color: r.color,
  align: r.align as LabelAlign,
});

export const linkTypeRow = (t: LinkType): NewRow<'link_type'> => ({
  id: t.id,
  name: t.name,
  color: t.color,
  width: t.width,
  dash: t.dash,
  description: t.description,
  sort_order: t.sortOrder,
  remote: t.remote ? 1 : 0,
});

export const nodeTypeRow = (t: NodeType): NewRow<'node_type'> => ({
  id: t.id,
  name: t.name,
  shape: t.shape,
  fill_color: t.fillColor,
  stroke_color: t.strokeColor,
  is_area: t.isArea ? 1 : 0,
  description: t.description,
  sort_order: t.sortOrder,
});

export const nodeRow = (n: MapNode): NewRow<'node'> => ({
  id: n.id,
  type_id: n.typeId,
  label: n.label,
  x: n.x,
  y: n.y,
  width: n.width,
  height: n.height,
  font_size: n.fontSize,
  label_dx: n.labelDx,
  label_dy: n.labelDy,
  note: n.note,
});

export const linkRow = (l: MapLink): NewRow<'link'> => ({
  id: l.id,
  type_id: l.typeId,
  from_node_id: l.fromNodeId,
  to_node_id: l.toNodeId ?? l.fromNodeId,
  shape: l.shape,
  curvature: l.curvature,
  corner_radius: l.cornerRadius,
  capacity: l.capacity,
  peer: l.peer,
  label_x: l.labelX,
  label_y: l.labelY,
  note: l.note,
});

/** Point ids derive from link id + position, so re-saving a link updates points in place. */
export const linkPointRows = (l: MapLink): NewRow<'link_point'>[] =>
  l.points.map((p, seq) => ({ id: `${l.id}:${seq}`, link_id: l.id, seq, x: p.x, y: p.y }));

export const labelRow = (l: MapLabel): NewRow<'label'> => ({
  id: l.id,
  text: l.text,
  x: l.x,
  y: l.y,
  font_size: l.fontSize,
  bold: l.bold ? 1 : 0,
  color: l.color,
  align: l.align,
});
