import { memo, type ReactNode } from 'react';
import type { LinkType, MapData, MapLabel, MapLink, MapNode, NodeType } from '@cloudmap/shared';
import type { ItemRef } from '../editor/operations';
import { cloudPath, linkLabelPosition, linkPath, type Bounds } from './geometry';
import { MultilineText } from './MultilineText';

export interface MapHighlight {
  selection?: ItemRef | null;
  /** First node picked when drawing a new link. */
  pendingNodeId?: string | null;
  hiddenLinkTypeIds?: ReadonlySet<string>;
}

interface Props {
  data: MapData;
  highlight?: MapHighlight;
  /** Adds hit areas and data attributes used by MapView for clicking and dragging. */
  interactive?: boolean;
  editing?: boolean;
}

const DIMMED = 0.2;
const SELECTION_COLOR = '#ffd400';

export function linkCaption(link: MapLink): string {
  return [link.capacity, link.technology && `(${link.technology})`].filter(Boolean).join('\n');
}

/**
 * Pure rendering of the map in map coordinates. Used both on screen
 * (wrapped in a zoomable <svg>) and for SVG/PNG export.
 */
export function MapLayers({ data, highlight = {}, interactive = false, editing = false }: Props) {
  const nodeTypes = new Map(data.nodeTypes.map((t) => [t.id, t]));
  const linkTypes = new Map(data.linkTypes.map((t) => [t.id, t]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const visibleLinks = data.links.filter((l) => !highlight.hiddenLinkTypeIds?.has(l.typeId));
  const selection = highlight.selection ?? null;

  // Dimming helps to read a selection in view mode but gets in the way while editing.
  const focus = editing ? undefined : focusSet(visibleLinks, selection);
  const nodeOpacity = (id: string) => (focus && !focus.nodes.has(id) ? DIMMED : 1);
  const linkOpacity = (id: string) => (focus && !focus.links.has(id) ? DIMMED : 1);
  const isSelected = (kind: ItemRef['kind'], id: string) =>
    (selection?.kind === kind && selection.id === id) || (kind === 'node' && highlight.pendingNodeId === id);

  const renderNode = (n: MapNode) => (
    <NodeShape
      key={n.id}
      node={n}
      type={nodeTypes.get(n.typeId)}
      opacity={nodeOpacity(n.id)}
      selected={isSelected('node', n.id)}
      interactive={interactive}
      editing={editing}
    />
  );
  const areas = data.nodes.filter((n) => nodeTypes.get(n.typeId)?.isArea);
  const regular = data.nodes.filter((n) => !nodeTypes.get(n.typeId)?.isArea);

  return (
    <g fontFamily="Helvetica, Arial, sans-serif">
      <g>{areas.map(renderNode)}</g>
      <g>
        {visibleLinks.map((l) => {
          const from = nodes.get(l.fromNodeId);
          const to = nodes.get(l.toNodeId);
          const type = linkTypes.get(l.typeId);
          if (!from || !to || !type) return null;
          return (
            <LinkLine
              key={l.id}
              id={l.id}
              d={linkPath(l, from, to)}
              type={type}
              opacity={linkOpacity(l.id)}
              selected={isSelected('link', l.id)}
              interactive={interactive}
            />
          );
        })}
      </g>
      <g>{regular.map(renderNode)}</g>
      <g>
        {visibleLinks.map((l) => {
          const from = nodes.get(l.fromNodeId);
          const to = nodes.get(l.toNodeId);
          const caption = linkCaption(l);
          if (!caption || !from || !to) return null;
          const at = linkLabelPosition(l, from, to);
          return (
            <g key={l.id} {...(interactive ? { 'data-kind': 'linkLabel', 'data-id': l.id } : {})}>
              <MultilineText
                x={at.x}
                y={at.y}
                text={caption}
                fontSize={13}
                halo={isSelected('link', l.id) ? SELECTION_COLOR : '#ffffff'}
                opacity={linkOpacity(l.id)}
                interactive={interactive}
              />
            </g>
          );
        })}
      </g>
      <g>
        {data.labels.map((label) => (
          <FreeLabel key={label.id} label={label} selected={isSelected('label', label.id)} interactive={interactive} />
        ))}
      </g>
    </g>
  );
}

function focusSet(links: MapLink[], selection: ItemRef | null) {
  if (selection?.kind === 'node') {
    const nodes = new Set([selection.id]);
    const linkIds = new Set<string>();
    for (const l of links) {
      if (l.fromNodeId === selection.id || l.toNodeId === selection.id) {
        linkIds.add(l.id);
        nodes.add(l.fromNodeId);
        nodes.add(l.toNodeId);
      }
    }
    return { nodes, links: linkIds };
  }
  if (selection?.kind === 'link') {
    const link = links.find((l) => l.id === selection.id);
    if (link) return { nodes: new Set([link.fromNodeId, link.toNodeId]), links: new Set([link.id]) };
  }
  return undefined;
}

const NodeShape = memo(function NodeShape({
  node,
  type,
  opacity,
  selected,
  interactive,
  editing,
}: {
  node: MapNode;
  type?: NodeType;
  opacity: number;
  selected: boolean;
  interactive: boolean;
  editing: boolean;
}) {
  if (!type) return null;
  const dataProps = interactive ? { 'data-kind': 'node', 'data-id': node.id } : {};

  if (type.shape === 'point') {
    // Invisible link endpoints; shown only while editing so they can be moved or removed.
    if (!editing) return null;
    return (
      <circle {...dataProps} cx={node.x} cy={node.y} r={selected ? 7 : 5} fill={selected ? SELECTION_COLOR : '#888888'} />
    );
  }

  const outline =
    type.shape === 'cloud' ? (
      <path d={cloudPath(node.x, node.y, node.width, node.height)} />
    ) : (
      <ellipse cx={node.x} cy={node.y} rx={node.width / 2} ry={node.height / 2} />
    );

  return (
    <g opacity={opacity} {...dataProps}>
      {selected && (
        <g fill="none" stroke={SELECTION_COLOR} strokeWidth={10} strokeLinejoin="round">
          {outline}
        </g>
      )}
      {/* Areas cover much of the map, so only their outline and name react to the pointer. */}
      <g
        fill={type.fillColor ?? 'none'}
        stroke={type.strokeColor}
        strokeWidth={type.isArea ? 2 : 1.5}
        pointerEvents={type.isArea ? 'none' : undefined}
      >
        {outline}
      </g>
      {interactive && type.isArea && (
        <g fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke">
          {outline}
        </g>
      )}
      {node.label && (
        <MultilineText
          x={node.x + node.labelDx}
          y={node.y + node.labelDy}
          text={node.label}
          fontSize={node.fontSize}
          bold={type.shape === 'cloud'}
          interactive={interactive && type.isArea}
        />
      )}
    </g>
  );
});

const LinkLine = memo(function LinkLine({
  id,
  d,
  type,
  opacity,
  selected,
  interactive,
}: {
  id: string;
  d: string;
  type: LinkType;
  opacity: number;
  selected: boolean;
  interactive: boolean;
}) {
  return (
    <g opacity={opacity}>
      {selected && <path d={d} fill="none" stroke={SELECTION_COLOR} strokeWidth={type.width + 10} strokeLinecap="round" />}
      <path d={d} fill="none" stroke={type.color} strokeWidth={type.width} strokeDasharray={type.dash || undefined} />
      {interactive && (
        // Wide transparent stroke makes thin links easy to click.
        <path
          data-kind="link"
          data-id={id}
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(type.width, 14)}
        />
      )}
    </g>
  );
});

const FreeLabel = memo(function FreeLabel({ label, selected, interactive }: { label: MapLabel; selected: boolean; interactive: boolean }) {
  return (
    <g {...(interactive ? { 'data-kind': 'label', 'data-id': label.id } : {})}>
      <MultilineText
        x={label.x}
        y={label.y}
        text={label.text}
        fontSize={label.fontSize}
        bold={label.bold}
        fill={label.color}
        align={label.align}
        halo={selected ? SELECTION_COLOR : undefined}
        interactive={interactive}
      />
    </g>
  );
});

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
