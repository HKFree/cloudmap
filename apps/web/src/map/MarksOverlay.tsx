import type { MapData, MapLink, MapNode } from '@cloudmap/shared';
import { cloudPath, linkPath, stubEnds } from './geometry';
import { MultilineText } from './MultilineText';

/**
 * Coloured emphasis of map items, used for changes in a revision and for problems
 * found before saving. Colours are keyed by item id.
 */
export interface MapMarks {
  nodes: ReadonlyMap<string, string>;
  links: ReadonlyMap<string, string>;
  labels: ReadonlyMap<string, string>;
  /** Items that no longer exist, drawn as dashed outlines from the map they were taken from. */
  ghosts?: { map: MapData; nodes: string[]; links: string[]; labels: string[]; color: string };
}

export const MARK_COLORS = {
  added: '#2da44e',
  changed: '#fb8500',
  deleted: '#cf222e',
  problem: '#cf222e',
} as const;

const HALO_OPACITY = 0.55;

/** Wide coloured strokes drawn underneath the map items. */
export function MarkHalos({ data, marks }: { data: MapData; marks: MapMarks }) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  return (
    <g opacity={HALO_OPACITY} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
      {data.links.map((link) => {
        const color = marks.links.get(link.id);
        return color ? <LinkShape key={link.id} map={data} nodes={nodes} link={link} stroke={color} width={18} /> : null;
      })}
      {data.nodes.map((node) => {
        const color = marks.nodes.get(node.id);
        return color ? <NodeOutline key={node.id} map={data} node={node} stroke={color} width={16} /> : null;
      })}
      {data.labels.map((label) => {
        const color = marks.labels.get(label.id);
        if (!color) return null;
        return (
          <MultilineText
            key={label.id}
            x={label.x}
            y={label.y}
            text={label.text}
            fontSize={label.fontSize}
            bold={label.bold}
            align={label.align}
            fill={color}
            halo={color}
            haloWidth={14}
          />
        );
      })}
    </g>
  );
}

/** Dashed outlines of deleted items, drawn on top so they are visible over newer content. */
export function Ghosts({ ghosts }: { ghosts: NonNullable<MapMarks['ghosts']> }) {
  const { map, color } = ghosts;
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  return (
    <g fill="none" stroke={color} strokeDasharray="10 6" strokeWidth={3} opacity={0.8} pointerEvents="none">
      {ghosts.links.map((id) => {
        const link = map.links.find((l) => l.id === id);
        return link ? <LinkShape key={id} map={map} nodes={nodes} link={link} stroke={color} width={4} /> : null;
      })}
      {ghosts.nodes.map((id) => {
        const node = nodes.get(id);
        if (!node) return null;
        return (
          <g key={id}>
            <NodeOutline map={map} node={node} stroke={color} width={3} />
            {node.label && (
              <MultilineText x={node.x + node.labelDx} y={node.y + node.labelDy} text={node.label} fontSize={node.fontSize} fill={color} />
            )}
          </g>
        );
      })}
      {ghosts.labels.map((id) => {
        const label = map.labels.find((l) => l.id === id);
        if (!label) return null;
        return (
          <g key={id} textDecoration="line-through">
            <MultilineText x={label.x} y={label.y} text={label.text} fontSize={label.fontSize} align={label.align} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function NodeOutline({ map, node, stroke, width }: { map: MapData; node: MapNode; stroke: string; width: number }) {
  const shape = map.nodeTypes.find((t) => t.id === node.typeId)?.shape;
  if (shape === 'point' || node.width === 0) return <circle cx={node.x} cy={node.y} r={8} fill={stroke} stroke="none" />;
  if (shape === 'cloud') return <path d={cloudPath(node.x, node.y, node.width, node.height)} stroke={stroke} strokeWidth={width} />;
  return <ellipse cx={node.x} cy={node.y} rx={node.width / 2} ry={node.height / 2} stroke={stroke} strokeWidth={width} />;
}

function LinkShape({
  map,
  nodes,
  link,
  stroke,
  width,
}: {
  map: MapData;
  nodes: Map<string, MapNode>;
  link: MapLink;
  stroke: string;
  width: number;
}) {
  const from = nodes.get(link.fromNodeId);
  const to = nodes.get(link.toNodeId);
  if (!from || !to) return null;
  if (map.linkTypes.some((t) => t.id === link.typeId && t.remote)) {
    const [a, b] = stubEnds(link, from, to);
    return <path d={`M${from.x} ${from.y}L${a.x} ${a.y}M${to.x} ${to.y}L${b.x} ${b.y}`} stroke={stroke} strokeWidth={width} />;
  }
  return <path d={linkPath(link, from, to)} stroke={stroke} strokeWidth={width} />;
}
