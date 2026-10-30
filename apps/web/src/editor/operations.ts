import { linkNodeIds, temporaryId, type LinkType, type MapData, type MapLabel, type MapLink, type MapNode, type NodeType, type Point } from '@cloudmap/shared';
import { linkLabelPosition, linkMidpoint, remoteStubs } from '../map/geometry';

export type ItemKind = 'node' | 'link' | 'label';
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Things that can be dragged on the map. Handles carry their owner and position in the id:
 * `linkPoint` `<linkId>:<index>` moves a bend point or stub end, `linkPointNew` `<linkId>:<index>`
 * inserts a polyline vertex at that index, `resize` `<nodeId>:<corner>` resizes a node.
 */
export type DragRef = { kind: 'node' | 'label' | 'linkLabel' | 'linkPoint' | 'linkPointNew' | 'resize'; id: string };

/** Splits a handle id into the owner id and the part after the last colon. */
export function handleParts(id: string): [owner: string, part: string] {
  const at = id.lastIndexOf(':');
  return [id.slice(0, at), id.slice(at + 1)];
}

/** The map item a hit target belongs to, used for selecting. */
export function itemOf(ref: DragRef | ItemRef | { kind: 'linkLabel'; id: string }): ItemRef {
  switch (ref.kind) {
    case 'node':
    case 'link':
    case 'label':
      return { kind: ref.kind, id: ref.id };
    case 'linkLabel':
      return { kind: 'link', id: ref.id };
    case 'linkPoint':
    case 'linkPointNew':
      return { kind: 'link', id: handleParts(ref.id)[0] };
    case 'resize':
      return { kind: 'node', id: handleParts(ref.id)[0] };
  }
}

const DEFAULT_SIZES: Record<NodeType['shape'], { width: number; height: number }> = {
  cloud: { width: 90, height: 64 },
  ellipse: { width: 70, height: 28 },
  point: { width: 0, height: 0 },
};
const MIN_NODE_SIZE = 10;
export const DEFAULT_CORNER_RADIUS = 20;

const round = (value: number) => Math.round(value * 10) / 10;

export function createNode(type: NodeType, at: Point): MapNode {
  return {
    id: temporaryId(),
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

/** Without `toNodeId` the link is an external uplink whose stub points to `outerEnd`. */
export function createLink(fromNodeId: string, toNodeId: string | null, typeId: string, outerEnd?: Point): MapLink {
  return {
    id: temporaryId(),
    typeId,
    fromNodeId,
    toNodeId,
    shape: 'straight',
    curvature: 0,
    points: outerEnd ? [{ x: round(outerEnd.x), y: round(outerEnd.y) }] : [],
    cornerRadius: 0,
    capacity: '',
    peer: '',
    labelX: null,
    labelY: null,
    note: '',
  };
}

export function createLabel(at: Point): MapLabel {
  return { id: temporaryId(), text: 'Nový popisek', x: round(at.x), y: round(at.y), fontSize: 16, bold: false, color: '#000000', align: 'center' };
}

export function createLinkType(existing: LinkType[]): LinkType {
  const sortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1) + 1;
  return { id: temporaryId(), name: 'Nový typ', color: '#888888', width: 6, dash: '', description: '', sortOrder, remote: false };
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
        links: map.links.filter((l) => !linkNodeIds(l).includes(ref.id)),
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

/** Nodes lying inside an area node, including smaller areas nested in it. */
export function areaMembers(map: MapData, area: MapNode): Set<string> {
  const rx = area.width / 2;
  const ry = area.height / 2;
  const members = new Set<string>();
  if (rx === 0 || ry === 0) return members;
  for (const node of map.nodes) {
    if (node.id === area.id || node.width * node.height >= area.width * area.height) continue;
    if (((node.x - area.x) / rx) ** 2 + ((node.y - area.y) / ry) ** 2 <= 1) members.add(node.id);
  }
  return members;
}

export const isArea = (map: MapData, node: MapNode) => map.nodeTypes.some((t) => t.id === node.typeId && t.isArea);
/** Caption of the far end of an external uplink. */
export const peerName = (link: MapLink) => link.peer.trim() || 'mimo mapu';

/** Link title like "Andre ↔ Andre 2", or "4 PMV IGW ↗ CETIN" for an external uplink. */
export function linkTitle(link: MapLink, nodeName: (id: string) => string) {
  return link.toNodeId === null ? `${nodeName(link.fromNodeId)} ↗ ${peerName(link)}` : `${nodeName(link.fromNodeId)} ↔ ${nodeName(link.toNodeId)}`;
}

/** Drawn as stubs instead of a line: leased connectivity and external uplinks. */
export const isRemote = (map: MapData, link: MapLink) =>
  link.toNodeId === null || map.linkTypes.some((t) => t.id === link.typeId && t.remote);

/** Moves a dragged item by (dx, dy) relative to `map`, which is the state at drag start. */
export function moveItem(map: MapData, ref: DragRef, dx: number, dy: number): MapData {
  switch (ref.kind) {
    case 'label':
      return { ...map, labels: map.labels.map((l) => (l.id === ref.id ? { ...l, x: round(l.x + dx), y: round(l.y + dy) } : l)) };
    case 'linkLabel':
      return updateLink(map, ref.id, (link, from, to) => {
        if (!to) return {};
        const start = linkLabelPosition(link, from, to);
        return { labelX: round(start.x + dx), labelY: round(start.y + dy) };
      });
    case 'linkPoint': {
      const [linkId, index] = handleParts(ref.id);
      return updateLink(map, linkId, (link, from, to) => {
        const points = isRemote(map, link) ? remoteStubs(link, from, to).map((s) => s.end) : link.points;
        return { points: points.map((p, i) => (i === Number(index) ? { x: round(p.x + dx), y: round(p.y + dy) } : p)) };
      });
    }
    case 'linkPointNew': {
      const [linkId, index] = handleParts(ref.id);
      return updateLink(map, linkId, (link, from, to) => {
        if (!to) return {};
        const at = Number(index);
        const path = [from, ...link.points, to];
        const mid = { x: (path[at]!.x + path[at + 1]!.x) / 2, y: (path[at]!.y + path[at + 1]!.y) / 2 };
        const points = [...link.points];
        points.splice(at, 0, { x: round(mid.x + dx), y: round(mid.y + dy) });
        return { points };
      });
    }
    case 'resize': {
      const [nodeId, corner] = handleParts(ref.id);
      return resizeNode(map, nodeId, corner as Corner, dx, dy);
    }
    case 'node':
      return moveNode(map, ref.id, dx, dy);
  }
}

/** `to` is null for an external uplink. */
function updateLink(
  map: MapData,
  linkId: string,
  change: (link: MapLink, from: MapNode, to: MapNode | null) => Partial<MapLink>,
): MapData {
  const link = map.links.find((l) => l.id === linkId);
  const from = map.nodes.find((n) => n.id === link?.fromNodeId);
  const to = link?.toNodeId === null ? null : map.nodes.find((n) => n.id === link?.toNodeId);
  if (!link || !from || to === undefined) return map;
  return patchItem(map, 'links', linkId, change(link, from, to));
}

/** Removes a polyline vertex; a remote link gets its automatic stub direction back. */
export function removeLinkPoint(map: MapData, pointId: string): MapData {
  const [linkId, index] = handleParts(pointId);
  const link = map.links.find((l) => l.id === linkId);
  if (!link) return map;
  const points = isRemote(map, link) ? [] : link.points.filter((_, i) => i !== Number(index));
  return patchItem(map, 'links', linkId, { points });
}

/** Changes the shape of a link; a polyline starts with one vertex in the middle and rounded corners. */
export function changeLinkShape(map: MapData, linkId: string, shape: MapLink['shape']): MapData {
  return updateLink(map, linkId, (link, from, to) => {
    if (shape === link.shape || !to) return {};
    switch (shape) {
      case 'arc':
        return { shape, points: [], curvature: link.curvature || 0.15 };
      case 'polyline': {
        const mid = linkMidpoint({ ...link, points: [] }, from, to);
        return { shape, points: [{ x: round(mid.x), y: round(mid.y) }], cornerRadius: link.cornerRadius || DEFAULT_CORNER_RADIUS };
      }
      default:
        return { shape, points: [], curvature: 0 };
    }
  });
}

/** The corner opposite to the dragged one stays in place. */
function resizeNode(map: MapData, nodeId: string, corner: Corner, dx: number, dy: number): MapData {
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) return map;
  const sx = corner.endsWith('e') ? 1 : -1;
  const sy = corner.startsWith('s') ? 1 : -1;
  const width = Math.max(MIN_NODE_SIZE, round(node.width + sx * dx));
  const height = Math.max(MIN_NODE_SIZE, round(node.height + sy * dy));
  return patchItem(map, 'nodes', nodeId, {
    width,
    height,
    x: round(node.x + (sx * (width - node.width)) / 2),
    y: round(node.y + (sy * (height - node.height)) / 2),
  });
}

function moveNode(map: MapData, nodeId: string, dx: number, dy: number): MapData {
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) return map;
  const moved = new Set([node.id]);
  if (isArea(map, node)) {
    for (const id of areaMembers(map, node)) moved.add(id);
  }

  const shift = (p: Point, weight: number): Point => ({ x: round(p.x + dx * weight), y: round(p.y + dy * weight) });
  return {
    ...map,
    nodes: map.nodes.map((n) => (moved.has(n.id) ? { ...n, ...shift(n, 1) } : n)),
    links: map.links.map((link) => {
      const fromMoved = moved.has(link.fromNodeId);
      const toMoved = link.toNodeId !== null && moved.has(link.toNodeId);
      if (!fromMoved && !toMoved) return link;
      const remote = isRemote(map, link);
      // Bend points follow the end they are closer to, so curves keep their shape;
      // each stub of a remote link belongs entirely to its own node.
      const count = link.points.length;
      const weightAt = (i: number) => {
        if (fromMoved && toMoved) return 1;
        if (remote) return (i === 0) === fromMoved ? 1 : 0;
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
