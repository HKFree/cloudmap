import { describe, expect, it } from 'vitest';
import type { MapLink } from '@cloudmap/shared';
import { cloudPath, linkPath } from './geometry';

const link = (patch: Partial<MapLink>): MapLink => ({
  id: 'l',
  typeId: 't',
  fromNodeId: 'a',
  toNodeId: 'b',
  shape: 'straight',
  curvature: 0,
  points: [],
  capacity: '',
  technology: '',
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
});
