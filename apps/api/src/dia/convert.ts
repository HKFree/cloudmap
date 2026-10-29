import type { LinkType, MapLabel, MapLink, MapNode, NodeType, Point } from '@cloudmap/shared';
import {
  attrBool,
  attrColor,
  attrInt,
  attrPoint,
  attrPoints,
  attrReal,
  attrRect,
  attrText,
  type DiaObject,
  type DiaText,
} from './parse';

/** Dia works in centimetres; the original PNG export used 20 px per cm. */
const PX_PER_CM = 20;
const MARGIN_PX = 40;
/** Maximum distance (cm) between a capacity text and the link it describes. */
const LINK_LABEL_DISTANCE_CM = 2.5;
const LINK_LABEL_PATTERN = /\d\s*(m|g)b|mbit|gbit|mbps|gbps|ghz|mimo/i;
const LINK_LABEL_MAX_LINES = 3;

const LINE_TYPES = new Set(['Standard - Line', 'Standard - Arc', 'Standard - BezierLine', 'Standard - PolyLine']);
const CLOUD = 'Network - Cloud';
const FLOWCHART_ELLIPSE = 'Flowchart - Ellipse';
const STANDARD_ELLIPSE = 'Standard - Ellipse';
const TEXT = 'Standard - Text';

export const NODE_TYPES = {
  ap24: { id: 'ap24', name: 'AP 2,4 GHz', shape: 'cloud', fillColor: '#d4f3ff', strokeColor: '#000000', isArea: false },
  ap5: { id: 'ap5', name: 'AP 5 GHz', shape: 'cloud', fillColor: '#75ff75', strokeColor: '#000000', isArea: false },
  lan: { id: 'lan', name: 'LAN', shape: 'cloud', fillColor: '#ffffff', strokeColor: '#000000', isArea: true },
  nodeAp: { id: 'uzel-ap', name: 'Uzel s AP', shape: 'ellipse', fillColor: '#75ff75', strokeColor: '#000000', isArea: false },
  nodeOther: { id: 'uzel', name: 'Uzel (retranslace, klient…)', shape: 'ellipse', fillColor: '#ffffff', strokeColor: '#000000', isArea: false },
  point: { id: 'bod', name: 'Bod', shape: 'point', fillColor: null, strokeColor: '#000000', isArea: false },
} as const satisfies Record<string, Omit<NodeType, 'description' | 'sortOrder'>>;

export interface ImportedMap {
  linkTypes: LinkType[];
  nodeTypes: NodeType[];
  nodes: MapNode[];
  links: MapLink[];
  labels: MapLabel[];
}

export interface ImportReport {
  warnings: string[];
  linkLabelsMatched: number;
  freeLabels: number;
}

interface LineStyle {
  color: string;
  width: number;
  style: number;
  dashLength: number;
}

interface TextBox {
  obj: DiaObject;
  text: DiaText;
  center: Point;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  used: boolean;
}

interface PendingLink {
  link: MapLink;
  /** Original Dia geometry in cm, used to find nearby capacity labels. */
  path: Point[];
}

export function convertDia(objects: DiaObject[], newId: () => string): { map: ImportedMap; report: ImportReport } {
  const warnings: string[] = [];
  const origin = diagramOrigin(objects);
  const px = (p: Point): Point => ({
    x: round((p.x - origin.x) * PX_PER_CM + MARGIN_PX),
    y: round((p.y - origin.y) * PX_PER_CM + MARGIN_PX),
  });

  const texts: TextBox[] = objects.filter((o) => o.type === TEXT).flatMap((obj) => {
    const text = attrText(obj);
    const bounds = attrRect(obj, 'obj_bb');
    if (!text || !bounds || !text.string.trim()) return [];
    const center = { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
    return [{ obj, text, center, bounds, used: false }];
  });

  const legendLineIds = new Set<string>();
  const linkTypes = legendLinkTypes(objects, texts, legendLineIds, newId);
  const legendSampleIds = legendNodeSamples(objects, texts);

  const nodeTypes: NodeType[] = Object.values(NODE_TYPES).map((t, i) => ({ ...t, description: '', sortOrder: i }));
  const nodes: MapNode[] = [];
  const nodeIdByDiaId = new Map<string, string>();

  for (const obj of objects) {
    if (legendSampleIds.has(obj.id)) continue;
    const typeId = nodeTypeFor(obj);
    if (!typeId) continue;
    const corner = attrPoint(obj, 'elem_corner');
    const width = attrReal(obj, 'elem_width');
    const height = attrReal(obj, 'elem_height');
    if (!corner || width === undefined || height === undefined) continue;

    const center = { x: corner.x + width / 2, y: corner.y + height / 2 };
    const bounds = { x1: corner.x, y1: corner.y, x2: corner.x + width, y2: corner.y + height };
    const label = nodeLabel(obj, center, bounds, texts);
    const id = newId();
    nodeIdByDiaId.set(obj.id, id);
    nodes.push({
      id,
      typeId,
      label: label.text,
      ...px(center),
      width: round(width * PX_PER_CM),
      height: round(height * PX_PER_CM),
      fontSize: round(label.height * PX_PER_CM),
      labelDx: round((label.center.x - center.x) * PX_PER_CM),
      labelDy: round((label.center.y - center.y) * PX_PER_CM),
      note: '',
    });
  }
  for (const node of nodes) {
    if (!node.label && node.typeId !== NODE_TYPES.lan.id) warnings.push(`Uzel bez popisku na pozici ${node.x},${node.y}`);
  }

  const pointNode = (p: Point): string => {
    const id = newId();
    nodes.push({ id, typeId: NODE_TYPES.point.id, label: '', ...px(p), width: 0, height: 0, fontSize: 16, labelDx: 0, labelDy: 0, note: '' });
    return id;
  };

  const linkTypeMatcher = createLinkTypeMatcher(linkTypes, newId, warnings);
  const pending: PendingLink[] = [];
  let arrows = 0;

  for (const obj of objects) {
    if (!LINE_TYPES.has(obj.type) || legendLineIds.has(obj.id)) continue;
    const geometry = lineGeometry(obj);
    if (!geometry) continue;
    if ((attrInt(obj, 'start_arrow') ?? 0) > 0 || (attrInt(obj, 'end_arrow') ?? 0) > 0) arrows++;

    const start = geometry.path[0]!;
    const end = geometry.path[geometry.path.length - 1]!;
    const fromConn = obj.connections.find((c) => c.handle === 0);
    const toConn = obj.connections.find((c) => c.handle !== 0);
    const fromNodeId = (fromConn && nodeIdByDiaId.get(fromConn.to)) ?? pointNode(start);
    const toNodeId = (toConn && nodeIdByDiaId.get(toConn.to)) ?? pointNode(end);
    if (obj.connections.length < 2) {
      warnings.push(`Spoj ${obj.id} není připojen na obou koncích, volný konec převeden na bod`);
    }

    pending.push({
      link: {
        id: newId(),
        typeId: linkTypeMatcher.match(lineStyle(obj)),
        fromNodeId,
        toNodeId,
        shape: geometry.shape,
        curvature: geometry.curvature,
        points: geometry.controlPoints.map(px),
        capacity: '',
        labelX: null,
        labelY: null,
        note: '',
      },
      path: geometry.path,
    });
  }
  linkTypeMatcher.applyWidths();
  if (arrows > 0) warnings.push(`${arrows} spojů mělo šipky, ty zatím nejsou podporovány`);

  let linkLabelsMatched = 0;
  const labels: MapLabel[] = [];
  for (const box of texts) {
    if (box.used) continue;
    const target = isLinkLabel(box.text.string) ? nearestLink(box.center, pending) : undefined;
    if (target && !target.link.capacity) {
      const p = px(box.center);
      target.link.capacity = normalizeLines(box.text.string).join('\n');
      target.link.labelX = p.x;
      target.link.labelY = p.y;
      linkLabelsMatched++;
      continue;
    }
    labels.push(freeLabel(box, px, newId()));
  }

  return {
    map: { linkTypes, nodeTypes, nodes, links: pending.map((p) => p.link), labels },
    report: { warnings, linkLabelsMatched, freeLabels: labels.length },
  };
}

function diagramOrigin(objects: DiaObject[]): Point {
  let x = Infinity;
  let y = Infinity;
  for (const obj of objects) {
    const bb = attrRect(obj, 'obj_bb');
    if (!bb) continue;
    x = Math.min(x, bb.x1);
    y = Math.min(y, bb.y1);
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/** Legend rows are unconnected horizontal lines with their name written just to the right. */
function legendLinkTypes(objects: DiaObject[], texts: TextBox[], legendLineIds: Set<string>, newId: () => string): LinkType[] {
  const rows: { obj: DiaObject; text: TextBox }[] = [];
  for (const obj of objects) {
    if (obj.type !== 'Standard - Line' || obj.connections.length > 0) continue;
    const [a, b] = attrPoints(obj, 'conn_endpoints');
    if (!a || !b || Math.abs(a.y - b.y) > 1) continue;
    const right = Math.max(a.x, b.x);
    const y = (a.y + b.y) / 2;
    const text = texts.find((t) => !t.used && t.bounds.x1 > right && t.bounds.x1 - right < 3 && Math.abs(t.center.y - y) < 0.8);
    if (!text) continue;
    text.used = true;
    legendLineIds.add(obj.id);
    rows.push({ obj, text });
  }

  const legendTitle = texts.find((t) => t.text.string.trim() === 'legenda:');
  if (legendTitle) legendTitle.used = true;

  return rows
    .sort((a, b) => a.text.center.y - b.text.center.y)
    .map(({ obj, text }, i) => {
      const style = lineStyle(obj);
      return {
        id: newId(),
        name: normalizeLines(text.text.string).join(' '),
        color: style.color,
        width: round(style.width * PX_PER_CM),
        dash: dashPattern(style),
        description: '',
        sortOrder: i,
      };
    });
}

/** Sample clouds in the legend ("prefix název") and their captions are not part of the network. */
function legendNodeSamples(objects: DiaObject[], texts: TextBox[]): Set<string> {
  const ids = new Set<string>();
  for (const obj of objects) {
    if (obj.type !== CLOUD || !/název/i.test(attrText(obj)?.string ?? '')) continue;
    ids.add(obj.id);
    const corner = attrPoint(obj, 'elem_corner');
    if (!corner) continue;
    const caption = texts.find((t) => !t.used && Math.abs(t.center.y - corner.y - 1.5) < 2 && corner.x - t.bounds.x2 < 3 && t.bounds.x2 <= corner.x + 0.5);
    if (caption) caption.used = true;
  }
  return ids;
}

function nodeTypeFor(obj: DiaObject): string | undefined {
  if (obj.type === CLOUD) {
    if (attrBool(obj, 'show_background') === false) return NODE_TYPES.lan.id;
    const fill = attrColor(obj, 'fill_colour')?.toLowerCase();
    if (fill === NODE_TYPES.ap24.fillColor) return NODE_TYPES.ap24.id;
    if (fill === '#ffffff') return NODE_TYPES.lan.id;
    return NODE_TYPES.ap5.id;
  }
  if (obj.type === FLOWCHART_ELLIPSE || obj.type === STANDARD_ELLIPSE) {
    const fill = (attrColor(obj, 'fill_colour') ?? attrColor(obj, 'inner_color'))?.toLowerCase();
    return fill === '#75ff75' ? NODE_TYPES.nodeAp.id : NODE_TYPES.nodeOther.id;
  }
  return undefined;
}

function nodeLabel(
  obj: DiaObject,
  center: Point,
  bounds: TextBox['bounds'],
  texts: TextBox[],
): { text: string; center: Point; height: number } {
  const embedded = attrText(obj);
  if (embedded && embedded.string.trim()) {
    return { text: normalizeLines(embedded.string).join('\n'), center: embeddedTextCenter(embedded), height: embedded.height };
  }

  // Shapes without their own text have a separate text object placed over them.
  const inside = (p: Point, shrink: number) => {
    const dx = (bounds.x2 - bounds.x1) * shrink;
    const dy = (bounds.y2 - bounds.y1) * shrink;
    return p.x > bounds.x1 + dx && p.x < bounds.x2 - dx && p.y > bounds.y1 + dy && p.y < bounds.y2 - dy;
  };
  const shrink = obj.type === STANDARD_ELLIPSE ? 0 : 0.25;
  const candidate = texts
    .filter((t) => !t.used && inside(t.center, shrink) && !isLinkLabel(t.text.string))
    .sort((a, b) => distance(a.center, center) - distance(b.center, center))[0];
  if (!candidate) return { text: '', center, height: 0.8 };
  candidate.used = true;
  return { text: normalizeLines(candidate.text.string).join('\n'), center: candidate.center, height: candidate.text.height };
}

/** Dia places embedded text by the baseline of its first line; leading blank lines shift it down. */
function embeddedTextCenter(text: DiaText): Point {
  const lines = text.string.split('\n');
  const first = lines.findIndex((l) => l.trim());
  let last = lines.length - 1;
  while (last > first && !lines[last]!.trim()) last--;
  const top = text.pos.y - text.height * 0.8;
  const y = top + ((first + last + 1) / 2) * text.height;

  const longest = Math.max(...lines.map((l) => l.trim().length));
  const estimatedWidth = longest * text.height * 0.55;
  const x = text.alignment === 1 ? text.pos.x : text.alignment === 2 ? text.pos.x - estimatedWidth / 2 : text.pos.x + estimatedWidth / 2;
  return { x, y };
}

function lineStyle(obj: DiaObject): LineStyle {
  return {
    color: (attrColor(obj, 'line_color') ?? attrColor(obj, 'arc_color') ?? '#000000').toLowerCase(),
    width: attrReal(obj, 'line_width') ?? 0.1,
    style: attrInt(obj, 'line_style') ?? 0,
    dashLength: attrReal(obj, 'dashlength') ?? 1,
  };
}

/** SVG dash pattern in px equivalent to Dia line styles (solid, dashed, dash-dot, dash-dot-dot, dotted). */
function dashPattern({ style, dashLength }: LineStyle): string {
  const d = round(dashLength * PX_PER_CM);
  const dot = round(Math.max(d / 10, 1));
  switch (style) {
    case 1:
      return `${d} ${d}`;
    case 2:
      return `${d} ${d / 2} ${dot} ${d / 2}`;
    case 3:
      return `${d} ${d / 3} ${dot} ${d / 3} ${dot} ${d / 3}`;
    case 4:
      return `${dot} ${dot}`;
    default:
      return '';
  }
}

/**
 * Links are matched to the closest legend style. The type width is then taken
 * from the most common width of its links, because the legend samples are drawn
 * thinner than the real links.
 */
function createLinkTypeMatcher(linkTypes: LinkType[], newId: () => string, warnings: string[]) {
  const widths = new Map<string, number[]>();

  const match = (style: LineStyle): string => {
    const styleDash = dashPattern(style) !== '';
    let best: { type: LinkType; score: number } | undefined;
    for (const type of linkTypes) {
      const colorScore = colorDistance(style.color, type.color);
      const dashScore = styleDash === (type.dash !== '') ? 0 : 0.5;
      const widthScore = Math.min(Math.abs(style.width * PX_PER_CM - type.width) / 20, 0.2);
      const score = colorScore + dashScore + widthScore;
      if (!best || score < best.score) best = { type, score };
    }

    let type = best && colorDistance(style.color, best.type.color) < 0.25 ? best.type : undefined;
    if (!type) {
      type = {
        id: newId(),
        name: `Neznámý typ ${style.color}`,
        color: style.color,
        width: round(style.width * PX_PER_CM),
        dash: dashPattern(style),
        description: 'Vytvořeno při importu, styl nebyl v legendě',
        sortOrder: linkTypes.length,
      };
      linkTypes.push(type);
      warnings.push(`Styl spoje ${style.color} není v legendě, vytvořen typ „${type.name}“`);
    }
    const list = widths.get(type.id) ?? [];
    list.push(round(style.width * PX_PER_CM));
    widths.set(type.id, list);
    return type.id;
  };

  const applyWidths = () => {
    for (const type of linkTypes) {
      const list = widths.get(type.id);
      if (list?.length) type.width = mostCommon(list);
    }
  };

  return { match, applyWidths };
}

interface Geometry {
  shape: MapLink['shape'];
  curvature: number;
  controlPoints: Point[];
  /** Sampled path in Dia coordinates, first and last points are the endpoints. */
  path: Point[];
}

function lineGeometry(obj: DiaObject): Geometry | undefined {
  if (obj.type === 'Standard - Line') {
    const [a, b] = attrPoints(obj, 'conn_endpoints');
    return a && b ? { shape: 'straight', curvature: 0, controlPoints: [], path: [a, b] } : undefined;
  }
  if (obj.type === 'Standard - Arc') {
    const [a, b] = attrPoints(obj, 'conn_endpoints');
    const bounds = attrRect(obj, 'obj_bb');
    if (!a || !b) return undefined;
    const curvature = arcCurvature(a, b, attrReal(obj, 'curve_distance') ?? 0, bounds);
    return { shape: 'arc', curvature, controlPoints: [], path: sampleArc(a, b, curvature) };
  }
  if (obj.type === 'Standard - BezierLine') {
    const points = attrPoints(obj, 'bez_points');
    if (points.length < 4) return undefined;
    return { shape: 'bezier', curvature: 0, controlPoints: points.slice(1, -1), path: sampleBezier(points) };
  }
  if (obj.type === 'Standard - PolyLine') {
    const points = attrPoints(obj, 'poly_points');
    if (points.length < 2) return undefined;
    return { shape: 'polyline', curvature: 0, controlPoints: points.slice(1, -1), path: points };
  }
  return undefined;
}

/**
 * Dia stores an arc as a signed distance of its middle from the chord. Instead of
 * relying on Dia's sign convention, pick the side that lies inside the bounding box.
 */
function arcCurvature(a: Point, b: Point, curveDistance: number, bounds?: TextBox['bounds']): number {
  const length = distance(a, b);
  if (length === 0) return 0;
  const h = Math.abs(curveDistance);
  const left = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const leftCandidate = { x: mid.x + left.x * h, y: mid.y + left.y * h };
  const rightCandidate = { x: mid.x - left.x * h, y: mid.y - left.y * h };
  if (!bounds) return curveDistance / length;
  const sign = distanceToRect(leftCandidate, bounds) <= distanceToRect(rightCandidate, bounds) ? 1 : -1;
  return round((sign * h) / length, 4);
}

function sampleArc(a: Point, b: Point, curvature: number): Point[] {
  const length = distance(a, b);
  const left = { x: (b.y - a.y) / (length || 1), y: -(b.x - a.x) / (length || 1) };
  const points: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // Parabolic approximation is good enough for label matching.
    const bulge = 4 * t * (1 - t) * curvature * length;
    points.push({ x: a.x + (b.x - a.x) * t + left.x * bulge, y: a.y + (b.y - a.y) * t + left.y * bulge });
  }
  return points;
}

function sampleBezier(points: Point[]): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 0; i + 3 < points.length; i += 3) {
    const [p0, c1, c2, p1] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
    for (let s = 1; s <= 16; s++) {
      const t = s / 16;
      const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      });
    }
  }
  return out;
}

function nearestLink(p: Point, links: PendingLink[]): PendingLink | undefined {
  let best: { link: PendingLink; d: number } | undefined;
  for (const link of links) {
    for (let i = 0; i + 1 < link.path.length; i++) {
      const d = distanceToSegment(p, link.path[i]!, link.path[i + 1]!);
      if (!best || d < best.d) best = { link, d };
    }
  }
  return best && best.d <= LINK_LABEL_DISTANCE_CM ? best.link : undefined;
}

function freeLabel(box: TextBox, px: (p: Point) => Point, id: string): MapLabel {
  const align = box.text.alignment === 1 ? 'center' : box.text.alignment === 2 ? 'right' : 'left';
  const anchorX = align === 'center' ? box.center.x : align === 'right' ? box.bounds.x2 : box.bounds.x1;
  const p = px({ x: anchorX, y: box.center.y });
  return {
    id,
    text: normalizeLines(box.text.string).join('\n'),
    x: p.x,
    y: p.y,
    fontSize: round(box.text.height * PX_PER_CM),
    bold: box.text.bold,
    color: box.text.color.toLowerCase(),
    align,
  };
}

function isLinkLabel(text: string): boolean {
  return LINK_LABEL_PATTERN.test(text) && normalizeLines(text).length <= LINK_LABEL_MAX_LINES;
}

function normalizeLines(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

function colorDistance(a: string, b: string): number {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1! - r2!, g1! - g2!, b1! - b2!) / 441.7;
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToRect(p: Point, r: TextBox['bounds']): number {
  const dx = Math.max(r.x1 - p.x, 0, p.x - r.x2);
  const dy = Math.max(r.y1 - p.y, 0, p.y - r.y2);
  return Math.hypot(dx, dy);
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
