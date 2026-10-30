import type { MapData } from './index';

/**
 * Ids are readable and derived from names when an item is first saved,
 * e.g. node "183 Natura" → `183-natura`, link → `183-natura--4-pmv-igw`.
 * Until then new items carry a temporary id. An id never changes afterwards,
 * because links, history and shared URLs refer to it.
 */

const TEMPORARY_PREFIX = 'tmp-';
/** Keeps link ids (two node ids) and link point ids within varchar(64). */
const MAX_SLUG_LENGTH = 24;

let temporaryCounter = 0;

export function temporaryId(): string {
  temporaryCounter++;
  return `${TEMPORARY_PREFIX}${temporaryCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const isTemporaryId = (id: string) => id.startsWith(TEMPORARY_PREFIX);

export function slugify(text: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength + 1);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, maxLength)).replace(/-+$/, '');
}

/** Returns `base`, or `base-2`, `base-3`… when taken, and marks the result as taken. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

type MapContent = Pick<MapData, 'linkTypes' | 'nodeTypes' | 'nodes' | 'links' | 'labels'>;

/** Replaces temporary ids with readable ones and updates references to them. */
export function assignReadableIds<T extends MapContent>(map: T): { map: T; renamed: Map<string, string> } {
  const renamed = new Map<string, string>();
  const permanentIds = (items: { id: string }[]) => new Set(items.map((i) => i.id).filter((id) => !isTemporaryId(id)));
  const rename = <I extends { id: string }>(items: I[], baseId: (item: I) => string): I[] => {
    const taken = permanentIds(items);
    return items.map((item) => {
      if (!isTemporaryId(item.id)) return item;
      const id = uniqueId(baseId(item), taken);
      renamed.set(item.id, id);
      return { ...item, id };
    });
  };
  const ref = (id: string) => renamed.get(id) ?? id;

  const linkTypes = rename(map.linkTypes, (t) => slugify(t.name) || 'typ');
  const nodeTypes = rename(map.nodeTypes, (t) => slugify(t.name) || 'typ-uzlu');
  const unnamedBase = new Map(nodeTypes.map((t) => [t.id, t.shape === 'point' ? 'bod' : t.isArea ? 'oblast' : 'uzel']));
  const nodes = rename(
    map.nodes.map((n) => ({ ...n, typeId: ref(n.typeId) })),
    (n) => slugify(n.label) || (unnamedBase.get(n.typeId) ?? 'uzel'),
  );
  const links = rename(
    map.links.map((l) => ({ ...l, typeId: ref(l.typeId), fromNodeId: ref(l.fromNodeId), toNodeId: l.toNodeId && ref(l.toNodeId) })),
    (l) => `${l.fromNodeId}--${l.toNodeId ?? (slugify(l.peer) || 'mimo')}`,
  );
  const labels = rename(map.labels, (l) => ['popisek', slugify(l.text)].filter(Boolean).join('-'));

  if (renamed.size === 0) return { map, renamed };
  return { map: { ...map, linkTypes, nodeTypes, nodes, links, labels }, renamed };
}
