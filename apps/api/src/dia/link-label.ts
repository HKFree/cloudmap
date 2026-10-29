const CAPACITY = /\d+([.,]\d+)?\s*(k|m|g)(b|bit|bps|b\/s)/i;

/**
 * Splits an old map caption like "250Mbps\n(10Ghz)" into capacity ("250Mbps")
 * and technology ("10GHz"). Lines that are not a throughput count as technology.
 */
export function splitLinkLabel(text: string): { capacity: string; technology: string } {
  const capacity: string[] = [];
  const technology: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [, main = line, inParentheses] = line.match(/^(.*?)\s*\(([^)]*)\)$/) ?? [];
    if (inParentheses) technology.push(inParentheses.trim());
    if (!main) continue;
    if (CAPACITY.test(main)) capacity.push(main);
    else technology.push(main);
  }
  return {
    capacity: capacity.join(' '),
    technology: technology.join(' ').replace(/(\d)\s*ghz/gi, '$1GHz'),
  };
}
