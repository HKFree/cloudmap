import { describe, expect, it } from 'vitest';
import type { MapLink } from '@cloudmap/shared';
import { cloudPath, linkPath, stubEnds } from './geometry';

const link = (patch: Partial<MapLink>): MapLink => ({
  id: 'l',
  typeId: 't',
  fromNodeId: 'a',
  toNodeId: 'b',
  shape: 'straight',
  curvature: 0,
  points: [],
  capacity: '',
  peer: '',
  cornerRadius: 0,
  labelX: null,
  labelY: null,
  note: '',
  ...patch,
});

describe('geometry', () => {
  it('draws a closed cloud outline', () => {
    const d = cloudPath(0, 0, 100, 60);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/A/g)).toHaveLength(10);
  });

  it('draws arcs bulging to the left with a clockwise sweep', () => {
    const left = linkPath(link({ shape: 'arc', curvature: 0.2 }), { x: 0, y: 0 }, { x: 100, y: 0 });
    const right = linkPath(link({ shape: 'arc', curvature: -0.2 }), { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(left).toMatch(/A[\d.]+ [\d.]+ 0 0 1 /);
    expect(right).toMatch(/A[\d.]+ [\d.]+ 0 0 0 /);
  });

  it('draws bezier links through their control points', () => {
    const d = linkPath(link({ shape: 'bezier', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] }), { x: 0, y: 0 }, { x: 30, y: 0 });
    expect(d).toBe('M0.0 0.0C10.0 10.0 20.0 10.0 30.0 0.0');
  });

  it('rounds polyline corners', () => {
    const points = [{ x: 50, y: 50 }];
    const sharp = linkPath(link({ shape: 'polyline', points }), { x: 0, y: 50 }, { x: 50, y: 0 });
    const rounded = linkPath(link({ shape: 'polyline', points, cornerRadius: 10 }), { x: 0, y: 50 }, { x: 50, y: 0 });
    expect(sharp).toBe('M0.0 50.0L50.0 50.0L50.0 0.0');
    expect(rounded).toBe('M0.0 50.0L40.0 50.0Q50.0 50.0 50.0 40.0L50.0 0.0');
  });

  it('points remote link stubs towards the other end until they are moved', () => {
    const [a, b] = stubEnds(link({}), { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect([a.x, b.x]).toEqual([120, 880]);
    const moved = [{ x: 5, y: 5 }, { x: 6, y: 6 }];
    expect(stubEnds(link({ points: moved }), { x: 0, y: 0 }, { x: 1000, y: 0 })).toEqual(moved);
  });
});
