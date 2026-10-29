import { describe, expect, it } from 'vitest';
import { cloud, diagram, line, sampleDiagram, text } from '../test/fixtures';
import { convertDia, NODE_TYPES } from './convert';
import { parseDia } from './parse';

const convert = (xml: string) => convertDia(parseDia(xml));

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
    expect(map.links[0]).toMatchObject({ capacity: '250Mbps', note: '' });
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

  it('treats clouds without background as areas', () => {
    const { map } = convert(diagram(cloud('C1', 0, 0, 'Oblast', { background: false }), text('T', 50, 50, 'x')));
    expect(map.nodes[0]!.typeId).toBe(NODE_TYPES.area.id);
  });

  it('gives items readable ids derived from their names', () => {
    const { map } = convert(sampleDiagram());
    expect(map.nodes.map((n) => n.id).sort()).toEqual(['1-alfa', '2-beta']);
    expect(map.links[0]!.id).toBe('1-alfa--2-beta');
    expect(map.linkTypes[0]!.id).toBe('10ghz');
    expect(map.labels[0]!.id).toBe('popisek-volny-popisek');
  });

  it('moves link details not covered by the link type to the note', () => {
    const { map } = convert(
      diagram(
        line('L0', [0, 2], [5, 2], { stroke: '#0e820e' }),
        text('T0', 6, 2.2, '10GHz'),
        cloud('C1', 0, 10, 'A'),
        cloud('C2', 20, 10, 'B'),
        cloud('C3', 0, 30, 'C'),
        line('L1', [4, 11.5], [20, 11.5], { from: 'C1', to: 'C2' }),
        text('T1', 11, 11, '250Mbps (10Ghz)'),
        line('L2', [2, 13], [2, 30], { from: 'C1', to: 'C3' }),
        text('T2', 0.5, 21, '1Gbps (AF-11)'),
      ),
    );
    expect(map.links.find((l) => l.toNodeId === 'b')).toMatchObject({ capacity: '250Mbps', note: '' });
    expect(map.links.find((l) => l.toNodeId === 'c')).toMatchObject({ capacity: '1Gbps', note: 'AF-11' });
  });

  it('joins two leased line stubs when a caption names the other site', () => {
    const { map, report } = convert(
      diagram(
        line('L0', [0, 2], [5, 2], { stroke: '#7f7f7f' }),
        text('T0', 6, 2.2, 'datová konektivita'),
        cloud('C1', 0, 10, '183 Natura'),
        cloud('C2', 60, 10, '4 PMV'),
        line('L1', [4, 11.5], [10, 11.5], { stroke: '#7f7f7f', from: 'C1' }),
        line('L2', [60, 11.5], [52, 11.5], { stroke: '#7f7f7f', from: 'C2' }),
        text('T1', 6, 11.2, '1Gbps PMV'),
      ),
    );
    expect(map.linkTypes[0]!.remote).toBe(true);
    expect(map.nodes.map((n) => n.id).sort()).toEqual(['183-natura', '4-pmv']);
    expect(map.links).toHaveLength(1);
    expect(map.links[0]).toMatchObject({ fromNodeId: '183-natura', toNodeId: '4-pmv', capacity: '1Gbps' });
    expect(map.links[0]!.points).toHaveLength(2);
    expect(report.remoteLinksJoined).toBe(1);
  });
});
