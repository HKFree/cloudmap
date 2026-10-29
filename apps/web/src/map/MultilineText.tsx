import type { LabelAlign } from '@cloudmap/shared';

interface Props {
  x: number;
  /** Vertical centre of the whole text block. */
  y: number;
  text: string;
  fontSize: number;
  bold?: boolean;
  fill?: string;
  align?: LabelAlign;
  halo?: boolean;
  opacity?: number;
}

const LINE_HEIGHT = 1.15;
const anchors = { left: 'start', center: 'middle', right: 'end' } as const;

export function MultilineText({ x, y, text, fontSize, bold, fill = '#000000', align = 'center', halo, opacity }: Props) {
  const lines = text.split('\n');
  const firstLineOffset = (-(lines.length - 1) / 2) * fontSize * LINE_HEIGHT;
  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize}
      fontWeight={bold ? 'bold' : undefined}
      fill={fill}
      textAnchor={anchors[align]}
      dominantBaseline="central"
      opacity={opacity}
      pointerEvents="none"
      {...(halo ? { stroke: '#ffffff', strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' as const } : {})}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? firstLineOffset : fontSize * LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
