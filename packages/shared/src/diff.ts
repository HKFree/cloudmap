import type { MapChanges, MapCollection, MapData } from './index';

const collections: MapCollection[] = ['linkTypes', 'nodeTypes', 'nodes', 'links', 'labels'];

/** Changes that turn `base` into `next`, compared by id and content. */
export function diffMaps(base: MapData, next: MapData): MapChanges {
  const changes: MapChanges = {
    upsert: { linkTypes: [], nodeTypes: [], nodes: [], links: [], labels: [] },
    delete: { linkTypes: [], nodeTypes: [], nodes: [], links: [], labels: [] },
  };
  for (const key of collections) {
    const before = new Map<string, unknown>(base[key].map((item) => [item.id, item]));
    const after = new Set(next[key].map((item) => item.id));
    for (const item of next[key]) {
      const old = before.get(item.id);
      if (old !== item && JSON.stringify(old) !== JSON.stringify(item)) {
        (changes.upsert[key] as unknown[]).push(item);
      }
    }
    changes.delete[key] = base[key].filter((item) => !after.has(item.id)).map((item) => item.id);
  }
  return changes;
}

export function countChanges(changes: MapChanges): number {
  return collections.reduce((sum, key) => sum + changes.upsert[key].length + changes.delete[key].length, 0);
}
