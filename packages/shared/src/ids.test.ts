import { describe, expect, it } from 'vitest';
import { assignReadableIds, slugify, temporaryId, type MapData } from './index';

const node = (id: string, label: string, typeId = 'ap5') => ({
  id, typeId, label, x: 0, y: 0, width: 10, height: 10, fontSize: 12, labelDx: 0, labelDy: 0, note: '',
});

describe('slugify', () => {
  it('strips diacritics and punctuation', () => {
    expect(slugify('4 PMV\nIGW')).toBe('4-pmv-igw');
    expect(slugify('Kosičky – Žďár')).toBe('kosicky-zdar');
  });

  it('shortens long names at a word boundary', () => {
    expect(slugify('datová konektivita (mimo infrastrukturu hkfree)')).toBe('datova-konektivita-mimo');
  });
});

describe('assignReadableIds', () => {
  it('names new items and rewrites references to them', () => {
    const natura = temporaryId();
    const pmv = temporaryId();
    const map: Omit<MapData, 'revision'> = {
      linkTypes: [],
      nodeTypes: [{ id: 'bod', name: 'Bod', shape: 'point', fillColor: null, strokeColor: '#000000', isArea: false, description: '', sortOrder: 0 }],
      nodes: [node('183-natura', 'Stará Natura'), node(natura, '183 Natura'), node(pmv, '4 PMV\nIGW'), node(temporaryId(), '', 'bod')],
      links: [
        {
          id: temporaryId(), typeId: 'optika', fromNodeId: natura, toNodeId: pmv, shape: 'straight', curvature: 0,
          points: [], cornerRadius: 0, capacity: '', labelX: null, labelY: null, note: '',
        },
      ],
      labels: [{ id: temporaryId(), text: 'Severní část', x: 0, y: 0, fontSize: 12, bold: false, color: '#000000', align: 'left' }],
    };

    const { map: result, renamed } = assignReadableIds(map);
    expect(result.nodes.map((n) => n.id)).toEqual(['183-natura', '183-natura-2', '4-pmv-igw', 'bod']);
    expect(result.links[0]).toMatchObject({ id: '183-natura-2--4-pmv-igw', fromNodeId: '183-natura-2', toNodeId: '4-pmv-igw' });
    expect(result.labels[0]!.id).toBe('popisek-severni-cast');
    expect(renamed.get(natura)).toBe('183-natura-2');
  });
});
