import { XMLParser } from 'fast-xml-parser';
import type { Point } from '@cloudmap/shared';

export interface DiaText {
  string: string;
  height: number;
  pos: Point;
  color: string;
  /** 0 = left, 1 = center, 2 = right */
  alignment: number;
  bold: boolean;
}

export interface DiaConnection {
  handle: number;
  to: string;
}

export interface DiaObject {
  id: string;
  type: string;
  attrs: Map<string, RawNode>;
  connections: DiaConnection[];
}

type RawNode = Record<string, any>;

const arrayTags = new Set([
  'dia:layer',
  'dia:object',
  'dia:group',
  'dia:attribute',
  'dia:point',
  'dia:connection',
  'dia:real',
  'dia:enum',
]);

/** Parses a Dia XML document into a flat list of objects (groups are flattened). */
export function parseDia(xml: string): DiaObject[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (name) => arrayTags.has(name),
  });
  const doc = parser.parse(xml);
  const diagram = doc['dia:diagram'];
  if (!diagram) throw new Error('Soubor není Dia diagram');

  const objects: DiaObject[] = [];
  const collect = (container: RawNode) => {
    for (const obj of container['dia:object'] ?? []) objects.push(toObject(obj));
    for (const group of container['dia:group'] ?? []) collect(group);
  };
  for (const layer of diagram['dia:layer'] ?? []) collect(layer);
  return objects;
}

function toObject(raw: RawNode): DiaObject {
  const attrs = new Map<string, RawNode>();
  for (const attr of raw['dia:attribute'] ?? []) attrs.set(attr['@name'], attr);
  const connections = (raw['dia:connections']?.['dia:connection'] ?? []).map((c: RawNode) => ({
    handle: Number(c['@handle']),
    to: String(c['@to']),
  }));
  return { id: raw['@id'], type: raw['@type'], attrs, connections };
}

const parsePoint = (val: string): Point => {
  const [x, y] = val.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
};

export function attrReal(obj: DiaObject, name: string): number | undefined {
  const val = obj.attrs.get(name)?.['dia:real']?.[0]?.['@val'];
  return val === undefined ? undefined : Number(val);
}

export function attrInt(obj: DiaObject, name: string): number | undefined {
  const attr = obj.attrs.get(name);
  const val = attr?.['dia:enum']?.[0]?.['@val'] ?? attr?.['dia:int']?.['@val'];
  return val === undefined ? undefined : Number(val);
}

export function attrBool(obj: DiaObject, name: string): boolean | undefined {
  const val = obj.attrs.get(name)?.['dia:boolean']?.['@val'];
  return val === undefined ? undefined : val === 'true';
}

export function attrColor(obj: DiaObject, name: string): string | undefined {
  return obj.attrs.get(name)?.['dia:color']?.['@val'];
}

export function attrPoints(obj: DiaObject, name: string): Point[] {
  return (obj.attrs.get(name)?.['dia:point'] ?? []).map((p: RawNode) => parsePoint(p['@val']));
}

export function attrPoint(obj: DiaObject, name: string): Point | undefined {
  return attrPoints(obj, name)[0];
}

export function attrRect(obj: DiaObject, name: string): { x1: number; y1: number; x2: number; y2: number } | undefined {
  const val: string | undefined = obj.attrs.get(name)?.['dia:rectangle']?.['@val'];
  if (!val) return undefined;
  const [a, b] = val.split(';').map(parsePoint);
  return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : undefined;
}

export function attrText(obj: DiaObject): DiaText | undefined {
  const composite = obj.attrs.get('text')?.['dia:composite'];
  if (!composite) return undefined;
  const inner = new Map<string, RawNode>();
  for (const attr of composite['dia:attribute'] ?? []) inner.set(attr['@name'], attr);

  const rawString = inner.get('string')?.['dia:string'];
  const string = typeof rawString === 'string' ? rawString.replace(/^#|#$/g, '') : '';
  const font = inner.get('font')?.['dia:font'];
  const style = Number(font?.['@style'] ?? 0);
  return {
    string,
    height: Number(inner.get('height')?.['dia:real']?.[0]?.['@val'] ?? 0.8),
    pos: parsePoint(inner.get('pos')?.['dia:point']?.[0]?.['@val'] ?? '0,0'),
    color: inner.get('color')?.['dia:color']?.['@val'] ?? '#000000',
    alignment: Number(inner.get('alignment')?.['dia:enum']?.[0]?.['@val'] ?? 0),
    // Dia encodes font weight in bits 4-6 of the style; values >= 0x50 are bold.
    bold: (style & 0x70) >= 0x50 || /bold/i.test(String(font?.['@name'] ?? '')),
  };
}
