import { diffMaps, type MapCollection, type MapData } from '@cloudmap/shared';
import { linkTitle, type ItemKind, type ItemRef } from '../editor/operations';

export type ChangeKind = 'added' | 'changed' | 'deleted';

export interface ItemChange {
  kind: ChangeKind;
  collection: MapCollection;
  id: string;
  title: string;
  /** Human readable list of changed properties, only for `changed`. */
  details: string[];
}

const oneLine = (text: string) => text.replace(/\n/g, ' ').trim();

/** Czech names of properties; position-like fields are grouped so a drag reads as one change. */
const fieldNames: Record<MapCollection, Record<string, string>> = {
  nodes: { label: 'název', typeId: 'typ', x: 'poloha', y: 'poloha', width: 'velikost', height: 'velikost', fontSize: 'písmo', labelDx: 'poloha názvu', labelDy: 'poloha názvu', note: 'poznámka' },
  links: {
    typeId: 'typ', fromNodeId: 'konec', toNodeId: 'konec', shape: 'tvar', curvature: 'prohnutí', points: 'trasa',
    cornerRadius: 'zaoblení', capacity: 'kapacita', peer: 'protistrana', labelX: 'poloha popisku', labelY: 'poloha popisku', note: 'poznámka',
  },
  labels: { text: 'text', x: 'poloha', y: 'poloha', fontSize: 'písmo', bold: 'tučné', color: 'barva', align: 'zarovnání' },
  linkTypes: { name: 'název', color: 'barva', width: 'tloušťka', dash: 'styl čáry', description: 'popis', sortOrder: 'pořadí', remote: 'vzdálený spoj' },
  nodeTypes: { name: 'název', shape: 'tvar', fillColor: 'výplň', strokeColor: 'obrys', isArea: 'oblast', description: 'popis', sortOrder: 'pořadí' },
};

/** Fields whose old and new values are worth showing; for the rest only the name is listed. */
const valueFields = new Set(['label', 'text', 'name', 'capacity', 'typeId', 'note']);

export function describeRevision(before: MapData, after: MapData): ItemChange[] {
  const changes = diffMaps(before, after);
  const title = (collection: MapCollection, id: string) => itemTitle(after, collection, id) ?? itemTitle(before, collection, id) ?? id;
  const result: ItemChange[] = [];

  for (const collection of ['nodes', 'links', 'labels', 'linkTypes', 'nodeTypes'] as const) {
    const old = new Map<string, Record<string, unknown>>(before[collection].map((item) => [item.id, item as never]));
    for (const item of changes.upsert[collection]) {
      const previous = old.get(item.id);
      const kind = previous ? 'changed' : 'added';
      const details = previous ? changedFields(collection, previous, item as never, before, after) : [];
      result.push({ kind, collection, id: item.id, title: title(collection, item.id), details });
    }
    for (const id of changes.delete[collection]) {
      result.push({ kind: 'deleted', collection, id, title: title(collection, id), details: [] });
    }
  }
  return result;
}

function changedFields(
  collection: MapCollection,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  before: MapData,
  after: MapData,
): string[] {
  const names = fieldNames[collection];
  const details: string[] = [];
  for (const key of Object.keys(next)) {
    if (key === 'id' || JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue;
    const name = names[key] ?? key;
    let text = name;
    if (valueFields.has(key)) {
      const show = (value: unknown, map: MapData) => {
        if (key === 'typeId') return typeName(map, collection, String(value));
        return oneLine(String(value ?? '')) || '–';
      };
      text = `${name}: ${show(previous[key], before)} → ${show(next[key], after)}`;
    }
    if (!details.includes(text)) details.push(text);
  }
  return details;
}

function typeName(map: MapData, collection: MapCollection, id: string): string {
  const types = collection === 'links' ? map.linkTypes : map.nodeTypes;
  return types.find((t) => t.id === id)?.name ?? id;
}

function itemTitle(map: MapData, collection: MapCollection, id: string): string | undefined {
  switch (collection) {
    case 'nodes': {
      const node = map.nodes.find((n) => n.id === id);
      return node && (oneLine(node.label) || `(bez názvu, ${typeName(map, 'nodes', node.typeId)})`);
    }
    case 'links': {
      const link = map.links.find((l) => l.id === id);
      if (!link) return undefined;
      const name = (nodeId: string) => oneLine(map.nodes.find((n) => n.id === nodeId)?.label ?? '') || '(bod)';
      return linkTitle(link, name);
    }
    case 'labels': {
      const label = map.labels.find((l) => l.id === id);
      return label && oneLine(label.text);
    }
    case 'linkTypes':
      return map.linkTypes.find((t) => t.id === id)?.name;
    case 'nodeTypes':
      return map.nodeTypes.find((t) => t.id === id)?.name;
  }
}

export const emptyMap = (): MapData => ({ revision: null, linkTypes: [], nodeTypes: [], nodes: [], links: [], labels: [] });

const itemKinds: Partial<Record<MapCollection, ItemKind>> = { nodes: 'node', links: 'link', labels: 'label' };

/** The map item a change refers to; type changes have no place on the map. */
export function itemRefOf(change: ItemChange): ItemRef | null {
  const kind = itemKinds[change.collection];
  return kind ? { kind, id: change.id } : null;
}
