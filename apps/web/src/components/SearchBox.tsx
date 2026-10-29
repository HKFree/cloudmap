import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchable = useMemo(
    () => nodes.filter((n) => n.label).map((n) => ({ node: n, text: normalize(n.label.replace(/\n/g, ' ')) })),
    [nodes],
  );

  const needle = normalize(query.trim());
  const results = needle ? searchable.filter((s) => s.text.includes(needle)).slice(0, MAX_RESULTS) : [];

  // "/" focuses the search from anywhere outside a form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
      if (e.key !== '/' || typing || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const changeQuery = (value: string) => {
    setQuery(value);
    setActive(0);
  };

  const choose = (node: MapNode) => {
    onSelect(node);
    changeQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const result = results[active] ?? results[0];
      if (result) choose(result.node);
    } else if (e.key === 'Escape') {
      changeQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search">
      <input
        ref={inputRef}
        type="search"
        placeholder="Hledat uzel (číslo nebo název)…"
        value={query}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
        onChange={(e) => changeQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {!query && <kbd className="search-shortcut">/</kbd>}
      {needle && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.length === 0 && <li className="empty">Nic nenalezeno</li>}
          {results.map(({ node }, i) => (
            <li key={node.id} id={`search-result-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'active' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(node)}
              >
                {node.label.replace(/\n/g, ' ')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
