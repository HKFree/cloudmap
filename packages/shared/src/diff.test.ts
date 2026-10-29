import { describe, expect, it } from 'vitest';
import { countChanges, diffMaps, type MapData } from './index';

const node = (id: string, label: string) => ({
  id, typeId: 't', label, x: 0, y: 0, width: 10, height: 10, fontSize: 12, labelDx: 0, labelDy: 0, note: '',
});

const map = (nodes: ReturnType<typeof node>[]): MapData => ({
  revision: null, linkTypes: [], nodeTypes: [], nodes, links: [], labels: [],
});

describe('diffMaps', () => {
  it('finds added, changed and deleted items', () => {
    const base = map([node('a', 'A'), node('b', 'B'), node('c', 'C')]);
    const next = map([node('a', 'A'), node('b', 'B2'), node('d', 'D')]);
    const changes = diffMaps(base, next);
    expect(changes.upsert.nodes.map((n) => n.id)).toEqual(['b', 'd']);
    expect(changes.delete.nodes).toEqual(['c']);
    expect(countChanges(changes)).toBe(3);
  });

  it('reports nothing for equal maps', () => {
    const base = map([node('a', 'A')]);
    expect(countChanges(diffMaps(base, map([node('a', 'A')])))).toBe(0);
  });
});
