import type { LinkType, NodeType } from '@cloudmap/shared';
import { cloudPath } from './geometry';

interface Props {
  linkTypes: LinkType[];
  nodeTypes: NodeType[];
  x?: number;
  y?: number;
  showTitle?: boolean;
  scale?: number;
  hiddenLinkTypeIds?: ReadonlySet<string>;
  onToggleLinkType?: (id: string) => void;
}

const ROW = 26;
const SAMPLE_WIDTH = 56;
const TEXT_X = SAMPLE_WIDTH + 14;
export const LEGEND_WIDTH = 400;

export function legendHeight(linkTypes: LinkType[], nodeTypes: NodeType[], showTitle = true): number {
  return (visibleNodeTypes(nodeTypes).length + linkTypes.length + (showTitle ? 1 : 0)) * ROW + 8;
}

const visibleNodeTypes = (types: NodeType[]) => types.filter((t) => t.shape !== 'point');

/** Legend generated from node and link types, rendered as SVG so it can be part of the export. */
export function Legend({ linkTypes, nodeTypes, x = 0, y = 0, showTitle = true, scale = 1, hiddenLinkTypeIds, onToggleLinkType }: Props) {
  const nodes = visibleNodeTypes(nodeTypes);
  const top = showTitle ? 1 : 0;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fontFamily="Helvetica, Arial, sans-serif" fontSize={14}>
      {showTitle && (
        <text x={0} y={ROW / 2} fontWeight="bold" fontSize={16} dominantBaseline="central">
          Legenda
        </text>
      )}
      {nodes.map((t, i) => {
        const cy = ROW * (top + i + 0.5);
        return (
          <g key={t.id}>
            {t.shape === 'cloud' ? (
              <path d={cloudPath(SAMPLE_WIDTH / 2, cy, 44, 24)} fill={t.fillColor ?? 'none'} stroke={t.strokeColor} />
            ) : (
              <ellipse cx={SAMPLE_WIDTH / 2} cy={cy} rx={18} ry={9} fill={t.fillColor ?? 'none'} stroke={t.strokeColor} />
            )}
            <text x={TEXT_X} y={cy} dominantBaseline="central">
              {t.name}
            </text>
          </g>
        );
      })}
      {linkTypes.map((t, i) => {
        const cy = ROW * (top + nodes.length + i + 0.5);
        const hidden = hiddenLinkTypeIds?.has(t.id);
        return (
          <g
            key={t.id}
            opacity={hidden ? 0.3 : 1}
            onClick={onToggleLinkType ? () => onToggleLinkType(t.id) : undefined}
            style={onToggleLinkType ? { cursor: 'pointer' } : undefined}
          >
            {onToggleLinkType && <rect x={0} y={cy - ROW / 2} width={LEGEND_WIDTH} height={ROW} fill="transparent" />}
            {t.remote ? (
              <g stroke={t.color} strokeWidth={t.width} strokeDasharray={t.dash || undefined}>
                <line x1={0} y1={cy} x2={SAMPLE_WIDTH * 0.3} y2={cy} />
                <line x1={SAMPLE_WIDTH * 0.7} y1={cy} x2={SAMPLE_WIDTH} y2={cy} />
                <g fill="#ffffff" strokeWidth={2} strokeDasharray="none">
                  <circle cx={SAMPLE_WIDTH * 0.3} cy={cy} r={3} />
                  <circle cx={SAMPLE_WIDTH * 0.7} cy={cy} r={3} />
                </g>
              </g>
            ) : (
              <line x1={0} y1={cy} x2={SAMPLE_WIDTH} y2={cy} stroke={t.color} strokeWidth={t.width} strokeDasharray={t.dash || undefined} />
            )}
            <text x={TEXT_X} y={cy} dominantBaseline="central">
              {t.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
