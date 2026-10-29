const CAPACITY = /\d+([.,]\d+)?\s*(k|m|g)(b|bit|bps|b\/s)/i;

/**
 * Splits an old map caption like "250Mbps\n(10Ghz)" into capacity ("250Mbps")
 * and the rest ("10GHz"), which is usually the band, hardware or provider.
 */
export function splitLinkLabel(text: string): { capacity: string; rest: string } {
  const capacity: string[] = [];
  const rest: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [, main = line, inParentheses] = line.match(/^(.*?)\s*\(([^)]*)\)$/) ?? [];
    if (inParentheses) rest.push(inParentheses.trim());
    if (!main) continue;
    if (CAPACITY.test(main)) capacity.push(main);
    else rest.push(main);
  }
  return {
    capacity: capacity.join(' '),
    rest: rest.join(' ').replace(/(\d)\s*ghz/gi, '$1GHz'),
  };
}
