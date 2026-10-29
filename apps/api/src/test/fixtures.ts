/** Builders for a minimal Dia document, so tests do not depend on the real network map. */

const attr = (name: string, inner: string) => `<dia:attribute name="${name}">${inner}</dia:attribute>`;
const point = (x: number, y: number) => `<dia:point val="${x},${y}"/>`;
const real = (v: number) => `<dia:real val="${v}"/>`;
const color = (c: string) => `<dia:color val="${c}"/>`;
const rect = (x1: number, y1: number, x2: number, y2: number) => `<dia:rectangle val="${x1},${y1};${x2},${y2}"/>`;

function textComposite(text: string, x: number, y: number, alignment = 1) {
  return attr(
    'text',
    `<dia:composite type="text">
      ${attr('string', `<dia:string>#${text}#</dia:string>`)}
      ${attr('font', '<dia:font family="sans" style="80" name="Helvetica-Bold"/>')}
      ${attr('height', real(0.8))}
      ${attr('pos', point(x, y))}
      ${attr('color', color('#000000'))}
      ${attr('alignment', `<dia:enum val="${alignment}"/>`)}
    </dia:composite>`,
  );
}

export function cloud(id: string, x: number, y: number, label: string, { fill = '#75ff75', background = true } = {}) {
  const w = 4;
  const h = 3;
  return `<dia:object type="Network - Cloud" version="1" id="${id}">
    ${attr('obj_bb', rect(x, y, x + w, y + h))}
    ${attr('elem_corner', point(x, y))}
    ${attr('elem_width', real(w))}
    ${attr('elem_height', real(h))}
    ${attr('fill_colour', color(fill))}
    ${attr('show_background', `<dia:boolean val="${background}"/>`)}
    ${textComposite(label, x + w / 2, y + h / 2)}
  </dia:object>`;
}

export function text(id: string, x: number, y: number, value: string, alignment = 0) {
  return `<dia:object type="Standard - Text" version="1" id="${id}">
    ${attr('obj_bb', rect(x, y - 0.6, x + value.length * 0.4, y + 0.2))}
    ${textComposite(value, x, y, alignment)}
  </dia:object>`;
}

export function line(
  id: string,
  a: [number, number],
  b: [number, number],
  { stroke = '#0e820e', width = 0.3, from, to }: { stroke?: string; width?: number; from?: string; to?: string } = {},
) {
  const connections = [from && `<dia:connection handle="0" to="${from}" connection="4"/>`, to && `<dia:connection handle="1" to="${to}" connection="4"/>`]
    .filter(Boolean)
    .join('');
  return `<dia:object type="Standard - Line" version="0" id="${id}">
    ${attr('obj_bb', rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])))}
    ${attr('conn_endpoints', point(...a) + point(...b))}
    ${attr('line_color', color(stroke))}
    ${attr('line_width', real(width))}
    ${connections ? `<dia:connections>${connections}</dia:connections>` : ''}
  </dia:object>`;
}

export function diagram(...objects: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<dia:diagram xmlns:dia="http://www.lysator.liu.se/~alla/dia/">
  <dia:layer name="Oblacky" visible="true" active="true">${objects.join('\n')}</dia:layer>
</dia:diagram>`;
}

/** Legend with one 10GHz row, two connected clouds and a capacity label next to the link. */
export const sampleDiagram = () =>
  diagram(
    text('T1', 0, 0, 'legenda:'),
    line('L0', [0, 2], [5, 2], { stroke: '#0e820e', width: 0.3 }),
    text('T2', 6, 2.2, '10GHz'),
    cloud('C1', 0, 10, '1 Alfa'),
    cloud('C2', 20, 10, '2 Beta'),
    line('L1', [4, 11.5], [20, 11.5], { from: 'C1', to: 'C2' }),
    text('T3', 11, 11, '250Mbps'),
    text('T4', 30, 30, 'Volný popisek'),
  );
