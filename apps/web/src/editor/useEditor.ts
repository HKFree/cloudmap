import { useCallback, useMemo, useRef, useState } from 'react';
import { countChanges, diffMaps, type MapData } from '@cloudmap/shared';

const UNDO_LIMIT = 200;

interface History {
  base: MapData;
  draft: MapData;
  undo: MapData[];
  redo: MapData[];
}

/**
 * Local draft of the map with undo/redo. Nothing reaches the server until the
 * draft is saved; the server changes are computed as a diff against `base`.
 */
export function useEditor() {
  const [history, setHistory] = useState<History | null>(null);
  const lastCoalesceKey = useRef<string | null>(null);
  const dragStart = useRef<MapData | null>(null);
  const currentDraft = useRef<MapData | null>(null);
  currentDraft.current = history?.draft ?? null;

  const start = useCallback((base: MapData) => {
    lastCoalesceKey.current = null;
    setHistory({ base, draft: base, undo: [], redo: [] });
  }, []);

  const stop = useCallback(() => setHistory(null), []);

  /**
   * Applies a change. Consecutive changes with the same `coalesceKey`
   * (e.g. typing into one field) form a single undo step.
   */
  const apply = useCallback((change: (map: MapData) => MapData, coalesceKey?: string) => {
    const coalesce = coalesceKey !== undefined && coalesceKey === lastCoalesceKey.current;
    lastCoalesceKey.current = coalesceKey ?? null;
    setHistory((h) => {
      if (!h) return h;
      const draft = change(h.draft);
      if (draft === h.draft) return h;
      const undo = coalesce ? h.undo : [...h.undo, h.draft].slice(-UNDO_LIMIT);
      return { ...h, draft, undo, redo: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastCoalesceKey.current = null;
    setHistory((h) => {
      const previous = h?.undo.at(-1);
      if (!h || !previous) return h;
      return { ...h, draft: previous, undo: h.undo.slice(0, -1), redo: [...h.redo, h.draft] };
    });
  }, []);

  const redo = useCallback(() => {
    lastCoalesceKey.current = null;
    setHistory((h) => {
      const next = h?.redo.at(-1);
      if (!h || !next) return h;
      return { ...h, draft: next, redo: h.redo.slice(0, -1), undo: [...h.undo, h.draft] };
    });
  }, []);

  /** Dragging updates the draft continuously but creates one undo step when finished. */
  const beginDrag = useCallback(() => {
    lastCoalesceKey.current = null;
    dragStart.current = currentDraft.current;
  }, []);

  const dragTo = useCallback((move: (startMap: MapData) => MapData) => {
    const startMap = dragStart.current;
    if (!startMap) return;
    setHistory((h) => (h ? { ...h, draft: move(startMap) } : h));
  }, []);

  const endDrag = useCallback(() => {
    const startMap = dragStart.current;
    dragStart.current = null;
    setHistory((h) => {
      if (!h || !startMap || h.draft === startMap) return h;
      return { ...h, undo: [...h.undo, startMap].slice(-UNDO_LIMIT), redo: [] };
    });
  }, []);

  const changes = useMemo(() => (history ? diffMaps(history.base, history.draft) : null), [history]);

  return {
    active: history !== null,
    base: history?.base ?? null,
    draft: history?.draft ?? null,
    changes,
    changeCount: changes ? countChanges(changes) : 0,
    canUndo: (history?.undo.length ?? 0) > 0,
    canRedo: (history?.redo.length ?? 0) > 0,
    start,
    stop,
    apply,
    undo,
    redo,
    beginDrag,
    dragTo,
    endDrag,
  };
}

export type Editor = ReturnType<typeof useEditor>;
