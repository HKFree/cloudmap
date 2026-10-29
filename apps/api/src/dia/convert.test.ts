import { describe, expect, it } from 'vitest';
import { cloud, diagram, line, sampleDiagram, text } from '../test/fixtures';
import { convertDia, NODE_TYPES } from './convert';
import { parseDia } from './parse';

const convert = (xml: string) => {
  let n = 0;
  return convertDia(parseDia(xml), () => `id${n++}`);
};

describe('convertDia', () => {
  it('builds link types from the legend', () => {
    const { map } = convert(sampleDiagram());
    expect(map.linkTypes).toHaveLength(1);
    expect(map.linkTypes[0]).toMatchObject({ name: '10GHz', color: '#0e820e', width: 6, dash: '' });
  });

  it('converts clouds to nodes and connected lines to links', () => {
    const { map } = convert(sampleDiagram());
    const nodes = map.nodes.filter((n) => n.typeId === NODE_TYPES.ap5.id);
    expect(nodes.map((n) => n.label).sort()).toEqual(['1 Alfa', '2 Beta']);

    expect(map.links).toHaveLength(1);
    const [link] = map.links;
    const alfa = nodes.find((n) => n.label === '1 Alfa')!;
    const beta = nodes.find((n) => n.label === '2 Beta')!;
    expect(link).toMatchObject({ fromNodeId: alfa.id, toNodeId: beta.id, shape: 'straight', typeId: map.linkTypes[0]!.id });
  });

  it('attaches capacity labels to the nearest link and keeps other texts as free labels', () => {
    const { map, report } = convert(sampleDiagram());
    expect(map.links[0]).toMatchObject({ capacity: '250Mbps', technology: '' });
    expect(report.linkLabelsMatched).toBe(1);
    expect(map.labels.map((l) => l.text)).toEqual(['Volný popisek']);
  });

  it('turns unconnected link ends into point nodes and reports them', () => {
    const { map, report } = convert(diagram(cloud('C1', 0, 0, 'A'), line('L1', [4, 1], [10, 1], { from: 'C1' })));
    const point = map.nodes.find((n) => n.typeId === NODE_TYPES.point.id);
    expect(point).toBeDefined();
    expect(map.links[0]!.toNodeId).toBe(point!.id);
    expect(report.warnings.some((w) => w.includes('L1'))).toBe(true);
  });

  it('names the known 18GHz style that is missing in the legend', () => {
    const { map, report } = convert(
      diagram(cloud('C1', 0, 0, 'A'), cloud('C2', 10, 0, 'B'), line('L1', [4, 1], [10, 1], { stroke: '#ff06b0', from: 'C1', to: 'C2' })),
    );
    expect(map.linkTypes[0]!.name).toBe('18GHz');
    expect(report.warnings).toHaveLength(0);
  });

  it('creates a new link type for styles missing in the legend', () => {
    const { map, report } = convert(
      diagram(cloud('C1', 0, 0, 'A'), cloud('C2', 10, 0, 'B'), line('L1', [4, 1], [10, 1], { stroke: '#123456', from: 'C1', to: 'C2' })),
    );
    expect(map.linkTypes).toHaveLength(1);
    expect(map.linkTypes[0]!.color).toBe('#123456');
    expect(report.warnings.some((w) => w.includes('#123456'))).toBe(true);
  });

  it('treats clouds without background as LAN areas', () => {
    const { map } = convert(diagram(cloud('C1', 0, 0, 'Oblast', { background: false }), text('T', 50, 50, 'x')));
    expect(map.nodes[0]!.typeId).toBe(NODE_TYPES.lan.id);
  });
});
