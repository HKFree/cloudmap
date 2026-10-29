import { useCallback, useEffect, useState } from 'react';
import type { ItemKind, ItemRef } from './editor/operations';

/**
 * View state kept in the URL fragment, e.g. `#spoj=01ABC` or `#revize=5&uzel=01XYZ`,
 * so a selection can be shared as a link and browser back/forward works.
 */
export interface HashState {
  selection: ItemRef | null;
  revision: number | null;
}

const kindParams: Record<ItemKind, string> = { node: 'uzel', link: 'spoj', label: 'popisek' };

export function parseHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  let selection: ItemRef | null = null;
  for (const [kind, param] of Object.entries(kindParams) as [ItemKind, string][]) {
    const id = params.get(param);
    if (id) selection = { kind, id };
  }
  const revision = Number(params.get('revize'));
  return { selection, revision: Number.isInteger(revision) && revision > 0 ? revision : null };
}

export function formatHash({ selection, revision }: HashState): string {
  const params = new URLSearchParams();
  if (revision) params.set('revize', String(revision));
  if (selection) params.set(kindParams[selection.kind], selection.id);
  const text = params.toString();
  return text ? `#${text}` : '';
}

export interface HashNavigation {
  state: HashState;
  /** Increments when the state came from the URL (page load, back/forward, edited link). */
  navigationId: number;
}

export function useHashState() {
  const [current, setCurrent] = useState<HashNavigation>(() => ({ state: parseHash(location.hash), navigationId: 1 }));

  useEffect(() => {
    const onNavigate = () =>
      setCurrent((prev) => {
        const state = parseHash(location.hash);
        if (formatHash(state) === formatHash(prev.state)) return prev;
        return { state, navigationId: prev.navigationId + 1 };
      });
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    return () => {
      window.removeEventListener('popstate', onNavigate);
      window.removeEventListener('hashchange', onNavigate);
    };
  }, []);

  const navigate = useCallback((state: HashState, { replace = false } = {}) => {
    const url = `${location.pathname}${location.search}${formatHash(state)}`;
    if (url === `${location.pathname}${location.search}${location.hash}`) return;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    setCurrent((prev) => ({ state, navigationId: prev.navigationId }));
  }, []);

  return { ...current, navigate };
}
