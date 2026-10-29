import type { MapData, Point } from '@cloudmap/shared';
import type { Corner, ItemRef } from '../editor/operations';
import { stubEnds } from './geometry';

interface Props {
  data: MapData;
  selection: ItemRef | null;
  /** Current zoom; handles keep the same size on screen. */
  zoom: number;
}

const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_COLOR = '#0969da';

/** Drag handles of the selected item: node corners, polyline vertices and remote link stub ends. */
export function EditHandles({ data, selection, zoom }: Props) {
  const size = 1 / zoom;

  if (selection?.kind === 'node') {
    const node = data.nodes.find((n) => n.id === selection.id);
    const type = data.nodeTypes.find((t) => t.id === node?.typeId);
    if (!node || !type || type.shape === 'point') return null;
    const half = 5 * size;
    return (
      <g>
        <rect
          x={node.x - node.width / 2}
          y={node.y - node.height / 2}
          width={node.width}
          height={node.height}
          fill="none"
          stroke={HANDLE_COLOR}
          strokeWidth={size}
          strokeDasharray={`${4 * size} ${4 * size}`}
          pointerEvents="none"
        />
        {corners.map((corner) => (
          <rect
            key={corner}
            data-kind="resize"
            data-id={`${node.id}:${corner}`}
            className={`resize-${corner}`}
            x={node.x + (corner.endsWith('e') ? 1 : -1) * (node.width / 2) - half}
            y={node.y + (corner.startsWith('s') ? 1 : -1) * (node.height / 2) - half}
            width={half * 2}
            height={half * 2}
            fill="#ffffff"
            stroke={HANDLE_COLOR}
            strokeWidth={1.5 * size}
          />
        ))}
      </g>
    );
  }

  if (selection?.kind === 'link') {
    const link = data.links.find((l) => l.id === selection.id);
    const from = data.nodes.find((n) => n.id === link?.fromNodeId);
    const to = data.nodes.find((n) => n.id === link?.toNodeId);
    if (!link || !from || !to) return null;
    const remote = data.linkTypes.some((t) => t.id === link.typeId && t.remote);

    if (remote) {
      return <g>{stubEnds(link, from, to).map((p, i) => <PointHandle key={i} id={`${link.id}:${i}`} at={p} size={size} />)}</g>;
    }
    if (link.shape !== 'polyline') return null;
    const path = [from, ...link.points, to];
    return (
      <g>
        {path.slice(0, -1).map((p, i) => (
          <NewPointHandle key={`new${i}`} id={`${link.id}:${i}`} at={midpoint(p, path[i + 1]!)} size={size} />
        ))}
        {link.points.map((p, i) => (
          <PointHandle key={i} id={`${link.id}:${i}`} at={p} size={size} />
        ))}
      </g>
    );
  }

  return null;
}

function PointHandle({ id, at, size }: { id: string; at: Point; size: number }) {
  return (
    <circle data-kind="linkPoint" data-id={id} cx={at.x} cy={at.y} r={7 * size} fill="#ffffff" stroke={HANDLE_COLOR} strokeWidth={2 * size} />
  );
}

function NewPointHandle({ id, at, size }: { id: string; at: Point; size: number }) {
  const arm = 4 * size;
  return (
    <g data-kind="linkPointNew" data-id={id}>
      <circle cx={at.x} cy={at.y} r={7 * size} fill={HANDLE_COLOR} fillOpacity={0.7} />
      <path
        d={`M${at.x - arm} ${at.y}H${at.x + arm}M${at.x} ${at.y - arm}V${at.y + arm}`}
        stroke="#ffffff"
        strokeWidth={1.5 * size}
        pointerEvents="none"
      />
    </g>
  );
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
