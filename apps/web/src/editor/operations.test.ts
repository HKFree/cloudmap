import { describe, expect, it } from 'vitest';
import type { MapData, MapLink, MapNode } from '@cloudmap/shared';
import { formatHash, parseHash } from '../hash';
import { areaMembers, changeLinkShape, createLink, deleteItem, deleteLinkType, moveItem, moveLinkType, removeLinkPoint } from './operations';

const node = (id: string, x: number, y: number, typeId = 'ap', size = 20): MapNode => ({
  id, typeId, label: id, x, y, width: size, height: size, fontSize: 12, labelDx: 0, labelDy: 0, note: '',
});

const link = (id: string, from: string, to: string, patch: Partial<MapLink> = {}): MapLink => ({
  ...createLink(from, to, 'lt'),
  id,
  ...patch,
});

const map = (nodes: MapNode[], links: MapLink[] = []): MapData => ({
  revision: null,
  linkTypes: [
    { id: 'lt', name: '10GHz', color: '#000000', width: 2, dash: '', description: '', sortOrder: 0, remote: false },
    { id: 'lt2', name: '17GHz', color: '#ff0000', width: 2, dash: '', description: '', sortOrder: 1, remote: false },
    { id: 'leased', name: 'Datová konektivita', color: '#7f7f7f', width: 2, dash: '', description: '', sortOrder: 2, remote: true },
  ],
  nodeTypes: [
    { id: 'ap', name: 'AP', shape: 'cloud', fillColor: '#75ff75', strokeColor: '#000000', isArea: false, description: '', sortOrder: 0 },
    { id: 'lan', name: 'LAN', shape: 'cloud', fillColor: '#ffffff', strokeColor: '#000000', isArea: true, description: '', sortOrder: 1 },
  ],
  nodes,
  links,
  labels: [],
});

describe('moveItem', () => {
  it('moves a node and shifts bend points and label of its links proportionally', () => {
    const start = map(
      [node('a', 0, 0), node('b', 100, 0)],
      [link('l', 'a', 'b', { shape: 'bezier', points: [{ x: 25, y: 10 }, { x: 75, y: 10 }], labelX: 50, labelY: 5 })],
    );
    const moved = moveItem(start, { kind: 'node', id: 'a' }, 0, 30);
    expect(moved.nodes[0]).toMatchObject({ x: 0, y: 30 });
    expect(moved.links[0]!.points).toEqual([{ x: 25, y: 30 }, { x: 75, y: 20 }]);
    expect(moved.links[0]).toMatchObject({ labelX: 50, labelY: 20 });
  });

  it('moves members together with an area', () => {
    const start = map([node('lan', 0, 0, 'lan', 200), node('inside', 30, 20), node('outside', 300, 0)]);
    expect([...areaMembers(start, start.nodes[0]!)]).toEqual(['inside']);
    const moved = moveItem(start, { kind: 'node', id: 'lan' }, 10, 10);
    expect(moved.nodes.map((n) => [n.x, n.y])).toEqual([[10, 10], [40, 30], [300, 0]]);
  });

  it('moves nested areas with the outer one', () => {
    const start = map([node('outer', 0, 0, 'lan', 400), node('inner', 50, 0, 'lan', 100), node('ap', 60, 10)]);
    expect([...areaMembers(start, start.nodes[0]!)].sort()).toEqual(['ap', 'inner']);
    expect([...areaMembers(start, start.nodes[1]!)]).toEqual(['ap']);
  });

  it('keeps each stub of a remote link with its own node', () => {
    const points = [{ x: 100, y: 0 }, { x: 900, y: 0 }];
    const start = map([node('a', 0, 0), node('b', 1000, 0)], [link('l', 'a', 'b', { typeId: 'leased', points })]);
    const moved = moveItem(start, { kind: 'node', id: 'a' }, 0, 50);
    expect(moved.links[0]!.points).toEqual([{ x: 100, y: 50 }, { x: 900, y: 0 }]);
  });

  it('resizes a node keeping the opposite corner in place', () => {
    const start = map([node('a', 0, 0, 'ap', 20)]);
    const resized = moveItem(start, { kind: 'resize', id: 'a:se' }, 10, 20);
    expect(resized.nodes[0]).toMatchObject({ x: 5, y: 10, width: 30, height: 40 });
  });

  it('adds, moves and removes polyline vertices', () => {
    let m = map([node('a', 0, 0), node('b', 100, 0)], [link('l', 'a', 'b')]);
    m = changeLinkShape(m, 'l', 'polyline');
    expect(m.links[0]).toMatchObject({ shape: 'polyline', points: [{ x: 50, y: 0 }], cornerRadius: 20 });
    m = moveItem(m, { kind: 'linkPointNew', id: 'l:1' }, 0, 30);
    expect(m.links[0]!.points).toEqual([{ x: 50, y: 0 }, { x: 75, y: 30 }]);
    m = moveItem(m, { kind: 'linkPoint', id: 'l:0' }, 0, -10);
    expect(m.links[0]!.points[0]).toEqual({ x: 50, y: -10 });
    m = removeLinkPoint(m, 'l:0');
    expect(m.links[0]!.points).toEqual([{ x: 75, y: 30 }]);
  });

  it('places a link label at the link midpoint when dragged for the first time', () => {
    const start = map([node('a', 0, 0), node('b', 100, 0)], [link('l', 'a', 'b')]);
    const moved = moveItem(start, { kind: 'linkLabel', id: 'l' }, 0, -10);
    expect(moved.links[0]).toMatchObject({ labelX: 50, labelY: -10 });
  });
});

describe('editing operations', () => {
  it('deletes a node together with its links', () => {
    const start = map([node('a', 0, 0), node('b', 1, 0), node('c', 2, 0)], [link('ab', 'a', 'b'), link('bc', 'b', 'c')]);
    const next = deleteItem(start, { kind: 'node', id: 'a' });
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(next.links.map((l) => l.id)).toEqual(['bc']);
  });

  it('keeps link types that are in use', () => {
    const start = map([node('a', 0, 0), node('b', 1, 0)], [link('ab', 'a', 'b')]);
    expect(deleteLinkType(start, 'lt')).toBe(start);
    expect(deleteLinkType(start, 'lt2').linkTypes.map((t) => t.id)).toEqual(['lt', 'leased']);
  });

  it('reorders link types', () => {
    const next = moveLinkType(map([]), 'lt2', -1);
    expect(next.linkTypes.map((t) => [t.id, t.sortOrder])).toEqual([['lt2', 0], ['lt', 1], ['leased', 2]]);
  });
});

describe('URL hash', () => {
  it('round-trips selection and revision', () => {
    const state = { selection: { kind: 'link' as const, id: '01ABC' }, revision: 5 };
    expect(formatHash(state)).toBe('#revize=5&spoj=01ABC');
    expect(parseHash('#revize=5&spoj=01ABC')).toEqual(state);
    expect(parseHash('')).toEqual({ selection: null, revision: null });
    expect(parseHash('#uzel=X')).toEqual({ selection: { kind: 'node', id: 'X' }, revision: null });
  });
});
