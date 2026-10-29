import { ulid } from 'ulid';
import type { LinkType, MapData, MapLabel, MapLink, MapNode, NodeType, Point } from '@cloudmap/shared';
import { linkLabelPosition } from '../map/geometry';

export type ItemKind = 'node' | 'link' | 'label';
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

/** Things that can be dragged on the map; a link label moves the caption of a link. */
export type DragRef = { kind: 'node' | 'label' | 'linkLabel'; id: string };

const DEFAULT_SIZES: Record<NodeType['shape'], { width: number; height: number }> = {
  cloud: { width: 90, height: 64 },
  ellipse: { width: 70, height: 28 },
  point: { width: 0, height: 0 },
};

const round = (value: number) => Math.round(value * 10) / 10;

export function createNode(type: NodeType, at: Point): MapNode {
  return {
    id: ulid(),
    typeId: type.id,
    label: type.shape === 'point' ? '' : 'Nový uzel',
    x: round(at.x),
    y: round(at.y),
    ...DEFAULT_SIZES[type.shape],
    fontSize: 14,
    labelDx: 0,
    labelDy: 0,
    note: '',
  };
}

export function createLink(fromNodeId: string, toNodeId: string, typeId: string): MapLink {
  return {
    id: ulid(),
    typeId,
    fromNodeId,
    toNodeId,
    shape: 'straight',
    curvature: 0,
    points: [],
    capacity: '',
    technology: '',
    labelX: null,
    labelY: null,
    note: '',
  };
}

export function createLabel(at: Point): MapLabel {
  return { id: ulid(), text: 'Nový popisek', x: round(at.x), y: round(at.y), fontSize: 16, bold: false, color: '#000000', align: 'center' };
}

export function createLinkType(existing: LinkType[]): LinkType {
  const sortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1;
  return { id: ulid(), name: 'Nový typ', color: '#888888', width: 6, dash: '', description: '', sortOrder };
}

type Collection = 'nodes' | 'links' | 'labels' | 'linkTypes';
type ItemOf<K extends Collection> = MapData[K][number];

export function upsertItem<K extends Collection>(map: MapData, key: K, item: ItemOf<K>): MapData {
  const list = map[key] as ItemOf<K>[];
  const index = list.findIndex((i) => i.id === item.id);
  const next = index === -1 ? [...list, item] : list.map((i, n) => (n === index ? item : i));
  return { ...map, [key]: next };
}

export function patchItem<K extends Collection>(map: MapData, key: K, id: string, patch: Partial<ItemOf<K>>): MapData {
  return { ...map, [key]: (map[key] as ItemOf<K>[]).map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

/** Removes an item; a node takes its links with it. */
export function deleteItem(map: MapData, ref: ItemRef): MapData {
  switch (ref.kind) {
    case 'node':
      return {
        ...map,
        nodes: map.nodes.filter((n) => n.id !== ref.id),
        links: map.links.filter((l) => l.fromNodeId !== ref.id && l.toNodeId !== ref.id),
      };
    case 'link':
      return { ...map, links: map.links.filter((l) => l.id !== ref.id) };
    case 'label':
      return { ...map, labels: map.labels.filter((l) => l.id !== ref.id) };
  }
}

export function deleteLinkType(map: MapData, id: string): MapData {
  if (map.links.some((l) => l.typeId === id)) return map;
  return { ...map, linkTypes: map.linkTypes.filter((t) => t.id !== id) };
}

/** Swaps sort order with the neighbour in the given direction. */
export function moveLinkType(map: MapData, id: string, direction: -1 | 1): MapData {
  const sorted = [...map.linkTypes].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = sorted.findIndex((t) => t.id === id);
  const other = sorted[index + direction];
  if (index === -1 || !other) return map;
  const current = sorted[index]!;
  const linkTypes = map.linkTypes
    .map((t) => (t.id === current.id ? { ...t, sortOrder: other.sortOrder } : t.id === other.id ? { ...t, sortOrder: current.sortOrder } : t))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...map, linkTypes };
}

/** Nodes lying inside an area node (e.g. a LAN cloud); they move together with it. */
export function areaMembers(map: MapData, area: MapNode): Set<string> {
  const rx = area.width / 2;
  const ry = area.height / 2;
  const areaTypes = new Set(map.nodeTypes.filter((t) => t.isArea).map((t) => t.id));
  const members = new Set<string>();
  for (const node of map.nodes) {
    if (node.id === area.id || areaTypes.has(node.typeId) || rx === 0 || ry === 0) continue;
    if (((node.x - area.x) / rx) ** 2 + ((node.y - area.y) / ry) ** 2 <= 1) members.add(node.id);
  }
  return members;
}

/** Moves a dragged item by (dx, dy) relative to `map`, which is the state at drag start. */
export function moveItem(map: MapData, ref: DragRef, dx: number, dy: number): MapData {
  if (ref.kind === 'label') {
    return { ...map, labels: map.labels.map((l) => (l.id === ref.id ? { ...l, x: round(l.x + dx), y: round(l.y + dy) } : l)) };
  }
  if (ref.kind === 'linkLabel') return moveLinkLabel(map, ref.id, dx, dy);

  const node = map.nodes.find((n) => n.id === ref.id);
  if (!node) return map;
  const moved = new Set([node.id]);
  if (map.nodeTypes.find((t) => t.id === node.typeId)?.isArea) {
    for (const id of areaMembers(map, node)) moved.add(id);
  }

  const shift = (p: Point, weight: number): Point => ({ x: round(p.x + dx * weight), y: round(p.y + dy * weight) });
  return {
    ...map,
    nodes: map.nodes.map((n) => (moved.has(n.id) ? { ...n, ...shift(n, 1) } : n)),
    links: map.links.map((link) => {
      const fromMoved = moved.has(link.fromNodeId);
      const toMoved = moved.has(link.toNodeId);
      if (!fromMoved && !toMoved) return link;
      // Bend points follow the end they are closer to, so curves keep their shape.
      const count = link.points.length;
      const weightAt = (i: number) => {
        if (fromMoved && toMoved) return 1;
        const t = (i + 1) / (count + 1);
        return fromMoved ? 1 - t : t;
      };
      const labelWeight = fromMoved && toMoved ? 1 : 0.5;
      return {
        ...link,
        points: link.points.map((p, i) => shift(p, weightAt(i))),
        ...(link.labelX !== null && link.labelY !== null
          ? { labelX: round(link.labelX + dx * labelWeight), labelY: round(link.labelY + dy * labelWeight) }
          : {}),
      };
    }),
  };
}

function moveLinkLabel(map: MapData, linkId: string, dx: number, dy: number): MapData {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  return {
    ...map,
    links: map.links.map((link) => {
      if (link.id !== linkId) return link;
      const from = nodes.get(link.fromNodeId);
      const to = nodes.get(link.toNodeId);
      if (!from || !to) return link;
      const start = linkLabelPosition(link, from, to);
      return { ...link, labelX: round(start.x + dx), labelY: round(start.y + dy) };
    }),
  };
}
