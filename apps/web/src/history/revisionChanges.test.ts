import { describe, expect, it } from 'vitest';
import type { MapData, MapNode } from '@cloudmap/shared';
import { createLink } from '../editor/operations';
import { describeRevision, emptyMap } from './revisionChanges';

const node = (id: string, label: string, patch: Partial<MapNode> = {}): MapNode => ({
  id, typeId: 'ap', label, x: 0, y: 0, width: 20, height: 20, fontSize: 12, labelDx: 0, labelDy: 0, note: '', ...patch,
});

const map = (patch: Partial<MapData>): MapData => ({
  ...emptyMap(),
  linkTypes: [
    { id: '10ghz', name: '10GHz', color: '#000000', width: 2, dash: '', description: '', sortOrder: 0, remote: false },
    { id: '17ghz', name: '17GHz', color: '#ff0000', width: 2, dash: '', description: '', sortOrder: 1, remote: false },
  ],
  ...patch,
});

describe('describeRevision', () => {
  it('lists added, changed and deleted items with readable details', () => {
    const link = { ...createLink('a', 'b', '10ghz'), id: 'a--b', capacity: '100Mbps' };
    const before = map({ nodes: [node('a', 'Alfa'), node('b', 'Beta'), node('c', 'Gama')], links: [link] });
    const after = map({
      nodes: [node('a', 'Alfa', { x: 10, y: 5 }), node('b', 'Beta 2'), node('d', 'Delta')],
      links: [{ ...link, capacity: '1Gbps', typeId: '17ghz' }],
    });

    const changes = describeRevision(before, after);
    expect(changes.map((c) => [c.kind, c.id])).toEqual([
      ['changed', 'a'],
      ['changed', 'b'],
      ['added', 'd'],
      ['deleted', 'c'],
      ['changed', 'a--b'],
    ]);
    expect(changes[0]!.details).toEqual(['poloha']);
    expect(changes[1]!.details).toEqual(['název: Beta → Beta 2']);
    expect(changes[3]!.title).toBe('Gama');
    expect(changes[4]!.title).toBe('Alfa ↔ Beta 2');
    expect(changes[4]!.details).toEqual(['typ: 10GHz → 17GHz', 'kapacita: 100Mbps → 1Gbps']);
  });
});
