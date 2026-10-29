import type { ReactNode } from 'react';
import type { LinkType, MapData, MapLink, MapNode, NodeType } from '@cloudmap/shared';
import { cloudPath, linkMidpoint, linkPath, type Bounds } from './geometry';
import { MultilineText } from './MultilineText';

export interface MapHighlight {
  selectedNodeId?: string;
  selectedLinkId?: string;
  hiddenLinkTypeIds?: ReadonlySet<string>;
}

interface Props {
  data: MapData;
  highlight?: MapHighlight;
  onNodeClick?: (node: MapNode) => void;
  onLinkClick?: (link: MapLink) => void;
}

const DIMMED = 0.2;

/**
 * Pure rendering of the map in map coordinates. Used both on screen
 * (wrapped in a zoomable <svg>) and for SVG/PNG export.
 */
export function MapLayers({ data, highlight = {}, onNodeClick, onLinkClick }: Props) {
  const nodeTypes = new Map(data.nodeTypes.map((t) => [t.id, t]));
  const linkTypes = new Map(data.linkTypes.map((t) => [t.id, t]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const visibleLinks = data.links.filter((l) => !highlight.hiddenLinkTypeIds?.has(l.typeId));

  const focus = focusSet(visibleLinks, highlight);
  const nodeOpacity = (id: string) => (focus && !focus.nodes.has(id) ? DIMMED : 1);
  const linkOpacity = (id: string) => (focus && !focus.links.has(id) ? DIMMED : 1);

  const areas = data.nodes.filter((n) => nodeTypes.get(n.typeId)?.isArea);
  const regular = data.nodes.filter((n) => !nodeTypes.get(n.typeId)?.isArea);

  return (
    <g fontFamily="Helvetica, Arial, sans-serif">
      <g>
        {areas.map((n) => (
          <NodeShape key={n.id} node={n} type={nodeTypes.get(n.typeId)} opacity={nodeOpacity(n.id)} onClick={onNodeClick} />
        ))}
      </g>
      <g>
        {visibleLinks.map((l) => {
          const from = nodes.get(l.fromNodeId);
          const to = nodes.get(l.toNodeId);
          const type = linkTypes.get(l.typeId);
          if (!from || !to || !type) return null;
          return (
            <LinkLine
              key={l.id}
              link={l}
              d={linkPath(l, from, to)}
              type={type}
              opacity={linkOpacity(l.id)}
              selected={highlight.selectedLinkId === l.id}
              onClick={onLinkClick}
            />
          );
        })}
      </g>
      <g>
        {regular.map((n) => (
          <NodeShape key={n.id} node={n} type={nodeTypes.get(n.typeId)} opacity={nodeOpacity(n.id)} onClick={onNodeClick} />
        ))}
      </g>
      <g>
        {visibleLinks.map((l) => {
          const from = nodes.get(l.fromNodeId);
          const to = nodes.get(l.toNodeId);
          if (!l.capacity || !from || !to) return null;
          const at = l.labelX !== null && l.labelY !== null ? { x: l.labelX, y: l.labelY } : linkMidpoint(l, from, to);
          return (
            <MultilineText
              key={l.id}
              x={at.x}
              y={at.y}
              text={l.capacity}
              fontSize={13}
              halo
              opacity={linkOpacity(l.id)}
            />
          );
        })}
      </g>
      <g>
        {data.labels.map((label) => (
          <MultilineText
            key={label.id}
            x={label.x}
            y={label.y}
            text={label.text}
            fontSize={label.fontSize}
            bold={label.bold}
            fill={label.color}
            align={label.align}
          />
        ))}
      </g>
    </g>
  );
}

function focusSet(links: MapLink[], highlight: MapHighlight) {
  if (highlight.selectedNodeId) {
    const nodes = new Set([highlight.selectedNodeId]);
    const linkIds = new Set<string>();
    for (const l of links) {
      if (l.fromNodeId === highlight.selectedNodeId || l.toNodeId === highlight.selectedNodeId) {
        linkIds.add(l.id);
        nodes.add(l.fromNodeId);
        nodes.add(l.toNodeId);
      }
    }
    return { nodes, links: linkIds };
  }
  if (highlight.selectedLinkId) {
    const link = links.find((l) => l.id === highlight.selectedLinkId);
    if (link) return { nodes: new Set([link.fromNodeId, link.toNodeId]), links: new Set([link.id]) };
  }
  return undefined;
}

function NodeShape({
  node,
  type,
  opacity,
  onClick,
}: {
  node: MapNode;
  type?: NodeType;
  opacity: number;
  onClick?: (node: MapNode) => void;
}) {
  if (!type || type.shape === 'point') return null;
  const fill = type.fillColor ?? 'none';
  const handleClick = onClick ? () => onClick(node) : undefined;
  const shapeProps = {
    fill,
    stroke: type.strokeColor,
    strokeWidth: type.isArea ? 2 : 1.5,
    onClick: handleClick,
    style: handleClick ? { cursor: 'pointer' } : undefined,
  };

  return (
    <g opacity={opacity} data-node-id={node.id}>
      {type.shape === 'cloud' ? (
        <path d={cloudPath(node.x, node.y, node.width, node.height)} {...shapeProps} />
      ) : (
        <ellipse cx={node.x} cy={node.y} rx={node.width / 2} ry={node.height / 2} {...shapeProps} />
      )}
      {node.label && (
        <MultilineText
          x={node.x + node.labelDx}
          y={node.y + node.labelDy}
          text={node.label}
          fontSize={node.fontSize}
          bold={type.shape === 'cloud'}
        />
      )}
    </g>
  );
}

function LinkLine({
  link,
  d,
  type,
  opacity,
  selected,
  onClick,
}: {
  link: MapLink;
  d: string;
  type: LinkType;
  opacity: number;
  selected: boolean;
  onClick?: (link: MapLink) => void;
}) {
  return (
    <g opacity={opacity}>
      {selected && <path d={d} fill="none" stroke="#ffeb3b" strokeWidth={type.width + 10} strokeLinecap="round" />}
      <path d={d} fill="none" stroke={type.color} strokeWidth={type.width} strokeDasharray={type.dash || undefined} />
      {onClick && (
        // Wide transparent stroke makes thin links easy to click.
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(type.width, 14)}
          style={{ cursor: 'pointer' }}
          onClick={() => onClick(link)}
        />
      )}
    </g>
  );
}

export function ExportSvg({ data, bounds, legend }: { data: MapData; bounds: Bounds; legend?: ReactNode }) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={Math.ceil(width)}
      height={Math.ceil(height)}
      viewBox={`${bounds.minX} ${bounds.minY} ${width} ${height}`}
    >
      <rect x={bounds.minX} y={bounds.minY} width={width} height={height} fill="#ffffff" />
      {legend}
      <MapLayers data={data} />
    </svg>
  );
}
