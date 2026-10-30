import { describe, expect, it } from 'vitest';
import { checkTopology, CORE_NODE_ID, linkedNodeIds, type MapData } from './index';

const nodeTypes: MapData['nodeTypes'] = [
  { id: 'ap', name: 'AP', shape: 'cloud', fillColor: '#75ff75', strokeColor: '#000000', isArea: false, description: '', sortOrder: 0 },
  { id: 'bod', name: 'Bod', shape: 'point', fillColor: null, strokeColor: '#000000', isArea: false, description: '', sortOrder: 1 },
];
const node = (id: string, typeId = 'ap') => ({ id, typeId, label: id, x: 0, y: 0, width: 10, height: 10, fontSize: 12, labelDx: 0, labelDy: 0, note: '' });
const link = (from: string, to: string) => ({
  id: `${from}--${to}`, typeId: 't', fromNodeId: from, toNodeId: to, shape: 'straight' as const, curvature: 0,
  points: [], cornerRadius: 0, capacity: '', peer: '', labelX: null, labelY: null, note: '',
});

describe('checkTopology', () => {
  it('finds loose link ends and sites cut off from the core', () => {
    const problems = checkTopology({
      nodeTypes,
      nodes: [node(CORE_NODE_ID), node('a'), node('b'), node('c'), node('lonely'), node('p1', 'bod'), node('p2', 'bod'), node('p3', 'bod')],
      links: [
        link(CORE_NODE_ID, 'p1'), link('p1', 'a'), // joined through a point: fine
        link('a', 'p2'), // loose end
        link('b', 'c'), // island
        link('p3', 'c'), // loose end on the island
      ],
    });
    expect(problems.looseLinks).toEqual(['a--p2', 'p3--c']);
    expect(problems.unreachableNodes).toEqual(['b', 'c']);
    expect(problems.coreMissing).toBe(false);
  });

  it('reports a site whose last link was removed', () => {
    const before = { nodeTypes, nodes: [node(CORE_NODE_ID), node('a')], links: [link(CORE_NODE_ID, 'a')] };
    const after = { ...before, links: [] };
    expect(checkTopology(after).unreachableNodes).toEqual([]);
    expect(checkTopology(after, linkedNodeIds(before)).unreachableNodes).toEqual(['a']);
  });

  it('treats an external uplink as neither loose nor a path to the core', () => {
    const uplink = (from: string) => ({ ...link(from, 'x'), id: `${from}--mimo`, toNodeId: null });
    const problems = checkTopology({
      nodeTypes,
      nodes: [node(CORE_NODE_ID), node('a'), node('island'), node('p1', 'bod')],
      links: [uplink(CORE_NODE_ID), link(CORE_NODE_ID, 'a'), uplink('island'), uplink('p1')],
    });
    expect(problems.looseLinks).toEqual(['p1--mimo']);
    expect(problems.unreachableNodes).toEqual(['island']);
  });

  it('reports a missing core node', () => {
    expect(checkTopology({ nodeTypes, nodes: [node('a')], links: [] }).coreMissing).toBe(true);
  });
});
