import { describe, expect, it } from 'vitest';
import { splitLinkLabel } from './link-label';

describe('splitLinkLabel', () => {
  it.each([
    ['250Mbps\n(10Ghz)', '250Mbps', '10GHz'],
    ['1Gbps', '1Gbps', ''],
    ['200Mbps (10Ghz)', '200Mbps', '10GHz'],
    ['MIMO', '', 'MIMO'],
    ['10Gbps\n(VDF)', '10Gbps', 'VDF'],
    ['2.5Gbps\n(80Ghz)', '2.5Gbps', '80GHz'],
    ['60GHz', '', '60GHz'],
    ['1x 1000 Mbit/s PMV', '1x 1000 Mbit/s PMV', ''],
  ])('%j', (text, capacity, technology) => {
    expect(splitLinkLabel(text)).toEqual({ capacity, technology });
  });
});
