import type { MapData, MapLink, Point } from '@cloudmap/shared';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const BUMP_COUNT = 10;
const BUMP_RADIUS = 0.6;

/**
 * Cloud outline made of circular bumps along an ellipse that fits the node box.
 * Slightly uneven bump spacing makes it look hand-drawn rather than like a gear.
 */
export function cloudPath(cx: number, cy: number, width: number, height: number): string {
  const perimeter = Math.PI * Math.sqrt((width * width + height * height) / 2);
  const chord = perimeter / BUMP_COUNT;
  const bulge = chord * (BUMP_RADIUS - Math.sqrt(BUMP_RADIUS ** 2 - 0.25));
  const rx = Math.max(width / 2 - bulge, width / 4);
  const ry = Math.max(height / 2 - bulge, height / 4);

  const points: Point[] = [];
  for (let i = 0; i < BUMP_COUNT; i++) {
    const jitter = i % 2 === 0 ? 0.12 : -0.12;
    const angle = ((i + jitter) / BUMP_COUNT) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }

  let d = `M${fmt(points[0]!)}`;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const r = Math.hypot(b.x - a.x, b.y - a.y) * BUMP_RADIUS;
    d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${fmt(b)}`;
  }
  return `${d}Z`;
}

export function linkPath(link: MapLink, from: Point, to: Point): string {
  switch (link.shape) {
    case 'arc':
      return arcPath(from, to, link.curvature);
    case 'bezier': {
      const pts = [from, ...link.points, to];
      let d = `M${fmt(from)}`;
      for (let i = 1; i + 2 < pts.length; i += 3) {
        d += `C${fmt(pts[i]!)} ${fmt(pts[i + 1]!)} ${fmt(pts[i + 2]!)}`;
      }
      return d;
    }
    case 'polyline':
      return polylinePath([from, ...link.points, to], link.cornerRadius);
    default:
      return `M${fmt(from)}L${fmt(to)}`;
  }
}

/** Corners are rounded with a quadratic curve that starts `radius` px before the vertex. */
function polylinePath(points: Point[], radius: number): string {
  let d = `M${fmt(points[0]!)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, corner, next] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    if (r <= 0) {
      d += `L${fmt(corner)}`;
      continue;
    }
    d += `L${fmt(towards(corner, prev, r))}Q${fmt(corner)} ${fmt(towards(corner, next, r))}`;
  }
  return `${d}L${fmt(points[points.length - 1]!)}`;
}

export const STUB_LENGTH = 120;

/**
 * Outer ends of the two stubs of a remote link: stored in `points` once moved,
 * otherwise pointing from each node towards the other one.
 */
export function stubEnds(link: MapLink, from: Point, to: Point): [Point, Point] {
  if (link.points.length === 2) return [link.points[0]!, link.points[1]!];
  const length = Math.min(STUB_LENGTH, distance(from, to) * 0.4);
  return [towards(from, to, length), towards(to, from, length)];
}

export interface Stub {
  start: Point;
  end: Point;
}

/**
 * Stubs a remote link is drawn as, one at each node. An external uplink has a single stub
 * leading out of the map, stored in `points` or pointing up by default.
 */
export function remoteStubs(link: MapLink, from: Point, to: Point | null): Stub[] {
  if (!to) return [{ start: from, end: link.points[0] ?? { x: from.x, y: from.y - STUB_LENGTH } }];
  const [fromEnd, toEnd] = stubEnds(link, from, to);
  return [
    { start: from, end: fromEnd },
    { start: to, end: toEnd },
  ];
}

/** Positive curvature bulges to the left of the from→to direction, which is a clockwise sweep on screen. */
function arcPath(from: Point, to: Point, curvature: number): string {
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  const h = Math.abs(curvature) * chord;
  if (h < 0.5 || chord === 0) return `M${fmt(from)}L${fmt(to)}`;
  const r = (chord * chord) / (8 * h) + h / 2;
  const largeArc = h > chord / 2 ? 1 : 0;
  const sweep = curvature > 0 ? 1 : 0;
  return `M${fmt(from)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} ${sweep} ${fmt(to)}`;
}

/** Where to put a link label when the import did not provide a position. */
export function linkMidpoint(link: MapLink, from: Point, to: Point): Point {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (link.shape === 'arc') {
    const chord = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const offset = link.curvature * chord;
    return { x: mid.x + ((to.y - from.y) / chord) * offset, y: mid.y - ((to.x - from.x) / chord) * offset };
  }
  if (link.points.length) return link.points[Math.floor(link.points.length / 2)]!;
  return mid;
}

export function linkLabelPosition(link: MapLink, from: Point, to: Point): Point {
  return link.labelX !== null && link.labelY !== null ? { x: link.labelX, y: link.labelY } : linkMidpoint(link, from, to);
}

export function mapBounds(data: MapData, padding = 40): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const n of data.nodes) {
    add(n.x - n.width / 2, n.y - n.height / 2);
    add(n.x + n.width / 2, n.y + n.height / 2);
  }
  for (const l of data.links) for (const p of l.points) add(p.x, p.y);
  for (const l of data.labels) add(l.x, l.y);
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return { minX: b.minX - padding, minY: b.minY - padding, maxX: b.maxX + padding, maxY: b.maxY + padding };
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Point at `length` from `from` in the direction of `to`. */
export function towards(from: Point, to: Point, length: number): Point {
  const d = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * length, y: from.y + ((to.y - from.y) / d) * length };
}

const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
