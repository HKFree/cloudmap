import { useMemo, useState } from 'react';
import type { MapNode } from '@cloudmap/shared';

const MAX_RESULTS = 12;

/** Case and diacritics insensitive, so "jicinska" finds "Jičínská". */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function SearchBox({ nodes, onSelect }: { nodes: MapNode[]; onSelect: (node: MapNode) => void }) {
  const [query, setQuery] = useState('');
  const searchable = useMemo(
    () => nodes.filter((n) => n.label).map((n) => ({ node: n, text: normalize(n.label.replace(/\n/g, ' ')) })),
    [nodes],
  );

  const needle = normalize(query.trim());
  const results = needle ? searchable.filter((s) => s.text.includes(needle)).slice(0, MAX_RESULTS) : [];

  const choose = (node: MapNode) => {
    onSelect(node);
    setQuery('');
  };

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Hledat uzel (číslo nebo název)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) choose(results[0].node);
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {needle && (
        <ul className="search-results">
          {results.length === 0 && <li className="empty">Nic nenalezeno</li>}
          {results.map(({ node }) => (
            <li key={node.id}>
              <button type="button" onClick={() => choose(node)}>
                {node.label.replace(/\n/g, ' ')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
