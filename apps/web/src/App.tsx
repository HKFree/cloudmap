import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assignReadableIds, checkTopology, CORE_NODE_ID, diffMaps, hasTopologyProblems, linkedNodeIds, type MapData, type Point } from '@cloudmap/shared';
import { fetchMap, restoreRevision, saveChanges } from './api';
import { DetailPanel } from './components/DetailPanel';
import { AppInfo } from './components/AppInfo';
import { HistoryPanel } from './components/HistoryPanel';
import { SearchBox } from './components/SearchBox';
import { EditToolbar, type Tool } from './editor/EditToolbar';
import { LinkTypesPanel } from './editor/LinkTypesPanel';
import { TopologyCheckPanel } from './editor/TopologyCheckPanel';
import { createLabel, createLink, createNode, deleteItem, moveItem, removeLinkPoint, upsertItem, type ItemRef } from './editor/operations';
import { useEditor } from './editor/useEditor';
import { useHashState } from './hash';
import { NARROW_SCREEN, useMediaQuery } from './useMediaQuery';
import { describeRevision, emptyMap, itemRefOf, type ItemChange } from './history/revisionChanges';
import { RevisionChangesPanel } from './history/RevisionChangesPanel';
import type { Bounds } from './map/geometry';
import { Legend, LEGEND_WIDTH, legendHeight } from './map/Legend';
import { MapView, type MapViewHandle } from './map/MapView';
import { MARK_COLORS, type MapMarks } from './map/MarksOverlay';

const dateFormat = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });

function itemBounds(map: MapData, item: ItemRef): Bounds | null {
  const around = (x: number, y: number, margin: number) => ({ minX: x - margin, minY: y - margin, maxX: x + margin, maxY: y + margin });
  if (item.kind === 'node') {
    const node = map.nodes.find((n) => n.id === item.id);
    return node ? around(node.x, node.y, Math.max(node.width, node.height, 200) * 2) : null;
  }
  if (item.kind === 'label') {
    const label = map.labels.find((l) => l.id === item.id);
    return label ? around(label.x, label.y, 300) : null;
  }
  const link = map.links.find((l) => l.id === item.id);
  const from = map.nodes.find((n) => n.id === link?.fromNodeId);
  const to = map.nodes.find((n) => n.id === link?.toNodeId);
  if (!link || !from || !to) return null;
  const points = [from, to, ...link.points];
  const padding = 150;
  return {
    minX: Math.min(...points.map((p) => p.x)) - padding,
    minY: Math.min(...points.map((p) => p.y)) - padding,
    maxX: Math.max(...points.map((p) => p.x)) + padding,
    maxY: Math.max(...points.map((p) => p.y)) + padding,
  };
}

export function App() {
  const [current, setCurrent] = useState<MapData | null>(null);
  const [viewed, setViewed] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<ReadonlySet<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const narrowScreen = useMediaQuery(NARROW_SCREEN);
  // On a phone the panel covers part of the map, so it opens only when needed.
  const [showSidebar, setShowSidebar] = useState(() => !window.matchMedia(NARROW_SCREEN).matches);
  const mapRef = useRef<MapViewHandle>(null);

  const editor = useEditor();
  const [tool, setTool] = useState<Tool>('select');
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [newNodeTypeId, setNewNodeTypeId] = useState('ap5');
  const [newLinkTypeId, setNewLinkTypeId] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checkingBeforeSave, setCheckingBeforeSave] = useState(false);
  const [previousOfViewed, setPreviousOfViewed] = useState<MapData | null>(null);
  const [dimUnchanged, setDimUnchanged] = useState(true);

  const { state: hashState, navigationId, navigate } = useHashState();
  const { selection, revision } = hashState;
  const editing = editor.active;
  const shown = editor.draft ?? (revision ? viewed : current);

  const reload = useCallback(async () => {
    const map = await fetchMap();
    setCurrent(map);
    return map;
  }, []);

  useEffect(() => {
    reload().catch((e: Error) => setError(e.message));
  }, [reload]);

  useEffect(() => {
    setViewed(null);
    setPreviousOfViewed(null);
    if (!revision) return;
    // The state right before the revision is needed to show what the revision changed.
    Promise.all([fetchMap(revision), revision > 1 ? fetchMap(revision - 1) : emptyMap()])
      .then(([map, previous]) => {
        setViewed(map);
        setPreviousOfViewed(previous);
      })
      .catch((e: Error) => setError(e.message));
  }, [revision]);

  const revisionChanges = useMemo(
    () => (viewed && previousOfViewed ? describeRevision(previousOfViewed, viewed) : null),
    [viewed, previousOfViewed],
  );

  const baseLinked = useMemo(() => (editor.base ? linkedNodeIds(editor.base) : new Set<string>()), [editor.base]);
  const topology = useMemo(
    () => (checkingBeforeSave && editor.draft ? checkTopology(editor.draft, baseLinked) : null),
    [checkingBeforeSave, editor.draft, baseLinked],
  );
  const baseTopology = useMemo(() => (checkingBeforeSave && editor.base ? checkTopology(editor.base) : null), [checkingBeforeSave, editor.base]);

  const marks = useMemo((): MapMarks | null => {
    if (editing && topology) {
      return {
        nodes: new Map(topology.unreachableNodes.map((id) => [id, MARK_COLORS.problem])),
        links: new Map(topology.looseLinks.map((id) => [id, MARK_COLORS.problem])),
        labels: new Map(),
      };
    }
    if (!editing && revisionChanges && previousOfViewed) {
      const byCollection = (collection: ItemChange['collection']) =>
        new Map(revisionChanges.filter((c) => c.collection === collection && c.kind !== 'deleted').map((c) => [c.id, MARK_COLORS[c.kind]]));
      const deleted = (collection: ItemChange['collection']) =>
        revisionChanges.filter((c) => c.collection === collection && c.kind === 'deleted').map((c) => c.id);
      return {
        nodes: byCollection('nodes'),
        links: byCollection('links'),
        labels: byCollection('labels'),
        ghosts: { map: previousOfViewed, nodes: deleted('nodes'), links: deleted('links'), labels: deleted('labels'), color: MARK_COLORS.deleted },
      };
    }
    return null;
  }, [editing, topology, revisionChanges, previousOfViewed]);

  const emphasis = useMemo(() => {
    if (!marks || (!editing && !dimUnchanged)) return null;
    const nodes = new Set(marks.nodes.keys());
    const links = new Set(marks.links.keys());
    // Keep the ends of highlighted and deleted links readable, as well as the selection.
    const ghostLinks = new Set(marks.ghosts?.links);
    for (const link of [...(shown?.links ?? []), ...(marks.ghosts?.map.links ?? [])]) {
      if (!links.has(link.id) && !ghostLinks.has(link.id)) continue;
      nodes.add(link.fromNodeId);
      nodes.add(link.toNodeId);
    }
    if (selection?.kind === 'node') nodes.add(selection.id);
    if (selection?.kind === 'link') links.add(selection.id);
    return { nodes, links };
  }, [marks, editing, dimUnchanged, shown, selection]);

  const focusItem = (item: ItemRef, map: MapData | null = shown) => {
    const bounds = map && itemBounds(map, item);
    if (bounds) mapRef.current?.focus(bounds);
  };

  const select = (item: ItemRef | null, focus = false) => {
    navigate({ selection: item, revision });
    if (item && narrowScreen) setShowSidebar(true);
    if (item && focus) focusItem(item);
  };

  // Selections coming from the URL (shared link, back/forward) bring the item into view.
  const focusedNavigation = useRef(0);
  useEffect(() => {
    if (!shown || focusedNavigation.current === navigationId) return;
    focusedNavigation.current = navigationId;
    if (selection) focusItem(selection, shown);
  }, [navigationId, shown]);

  useEffect(() => {
    if (editor.changeCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editor.changeCount]);

  const changeTool = (next: Tool) => {
    setTool(next);
    setPendingFrom(null);
  };

  const startEditing = () => {
    if (!current) return;
    if (revision) navigate({ selection, revision: null });
    setNewLinkTypeId((id) => id || current.linkTypes[0]?.id || '');
    setSaveError(null);
    setShowSidebar(true);
    setShowHistory(false);
    editor.start(current);
  };

  const finishEditing = (question = 'Máš neuložené změny. Opravdu je zahodit?') => {
    if (editor.changeCount > 0 && !confirm(question)) return;
    setCheckingBeforeSave(false);
    editor.stop();
    changeTool('select');
  };

  /** The logo leads "home": out of the editor, or to the whole map. */
  const onLogoClick = () => {
    if (!editing) return mapRef.current?.fit();
    if (editor.changeCount > 0) finishEditing('Ukončit úpravy? Máš neuložené změny, které se zahodí.');
    else if (confirm('Ukončit úpravy mapy?')) finishEditing();
  };

  const discardChanges = () => {
    if (!editor.base || !confirm('Zahodit všechny neuložené změny?')) return;
    editor.start(editor.base);
  };

  /** Saving first checks the network; problems are shown and the user decides whether to save anyway. */
  const requestSave = () => {
    if (!editor.draft) return;
    if (hasTopologyProblems(checkTopology(editor.draft, baseLinked))) setCheckingBeforeSave(true);
    else void save();
  };

  const save = async () => {
    if (!editor.draft || !editor.base) return;
    setSaving(true);
    setSaveError(null);
    try {
      // New items get their final, readable ids from their names only now.
      const { map: draft, renamed } = assignReadableIds(editor.draft);
      await saveChanges({ baseRevisionId: editor.base.revision?.id ?? null, message, ...diffMaps(editor.base, draft) });
      editor.start(await reload());
      setMessage('');
      setCheckingBeforeSave(false);
      const renamedSelection = selection && renamed.get(selection.id);
      if (renamedSelection) navigate({ selection: { ...selection, id: renamedSelection }, revision }, { replace: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Uložení selhalo');
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!revision || !confirm(`Obnovit mapu do stavu revize #${revision}? Vznikne nová revize.`)) return;
    try {
      await restoreRevision(revision);
      await reload();
      navigate({ selection, revision: null });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Obnovení selhalo');
    }
  };

  const deleteSelected = (item: ItemRef) => {
    if (item.kind === 'node' && item.id === CORE_NODE_ID) {
      alert('Centrální uzel 4 PMV IGW nelze smazat, kontrola sítě k němu hledá cesty.');
      return;
    }
    editor.apply((m) => deleteItem(m, item));
    navigate({ selection: null, revision }, { replace: true });
  };

  const onItemClick = (item: ItemRef) => {
    if (editing && tool === 'addLink') {
      if (item.kind !== 'node') return;
      if (!pendingFrom || pendingFrom === item.id) {
        setPendingFrom(pendingFrom === item.id ? null : item.id);
        return;
      }
      const link = createLink(pendingFrom, item.id, newLinkTypeId || shown!.linkTypes[0]!.id);
      editor.apply((m) => upsertItem(m, 'links', link));
      changeTool('select');
      select({ kind: 'link', id: link.id });
      return;
    }
    select(item);
  };

  const onBackgroundClick = (at: Point) => {
    if (editing && tool === 'addNode') {
      const type = shown!.nodeTypes.find((t) => t.id === newNodeTypeId) ?? shown!.nodeTypes[0]!;
      const node = createNode(type, at);
      editor.apply((m) => upsertItem(m, 'nodes', node));
      changeTool('select');
      select({ kind: 'node', id: node.id });
    } else if (editing && tool === 'addLabel') {
      const label = createLabel(at);
      editor.apply((m) => upsertItem(m, 'labels', label));
      changeTool('select');
      select({ kind: 'label', id: label.id });
    } else if (pendingFrom) {
      setPendingFrom(null);
    } else if (selection) {
      select(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
      if (e.key === 'Escape') {
        if (tool !== 'select' || pendingFrom) changeTool('select');
        else if (selection && !typing) select(null);
        return;
      }
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        mapRef.current?.fit();
        return;
      }
      if (!editing) return;
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) editor.redo();
        else editor.undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        deleteSelected(selection);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const searchBox = shown && <SearchBox nodes={shown.nodes} onSelect={(node) => select({ kind: 'node', id: node.id }, true)} />;

  const legendSvgHeight = shown ? legendHeight(shown.linkTypes, shown.nodeTypes, false) : 0;

  const isLatestViewed = revision !== null && revision === current?.revision?.id;

  const toggleLinkType = (id: string) =>
    setHiddenLinkTypes((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="layout">
      <header className="header">
        <button
          type="button"
          className={showSidebar ? 'active' : undefined}
          onClick={() => setShowSidebar((v) => !v)}
          title={showSidebar ? 'Skrýt panel' : 'Zobrazit panel'}
        >
          ☰
        </button>
        <h1>
          <button type="button" className="logo" onClick={onLogoClick} title={editing ? 'Ukončit úpravy' : 'Zobrazit celou mapu'}>
            <img src="/logo.svg" alt="hkfree" height={44} /> <span>cloudmap</span>
          </button>
        </h1>
        {!narrowScreen && searchBox}
        <button type="button" className="fit-button" onClick={() => mapRef.current?.fit()} disabled={!shown} title="Zobrazit celou mapu (klávesa C)">
          Vycentrovat <kbd>C</kbd>
        </button>
      </header>

      {!editing && revision && (
        <div className="banner">
          {viewed?.revision ? (
            <>
              {isLatestViewed ? 'Aktuální verze mapy' : 'Prohlížíš starší verzi mapy'}: revize #{viewed.revision.id} z{' '}
              {dateFormat.format(new Date(viewed.revision.createdAt))}
              {viewed.revision.message && ` – ${viewed.revision.message}`}
            </>
          ) : (
            <>Načítám revizi #{revision}…</>
          )}
          <span className="spacer" />
          {!isLatestViewed && (
            <button type="button" onClick={restore} disabled={!viewed}>
              Obnovit tuto verzi
            </button>
          )}
          <button type="button" onClick={() => navigate({ selection, revision: null })}>
            {isLatestViewed ? 'Skrýt změny' : 'Zobrazit aktuální'}
          </button>
        </div>
      )}

      <div className="workspace">
        {shown && showSidebar && (
          <aside className="sidebar">
            {narrowScreen && searchBox}
            <div className="toolbar-row">
              {!editing && (
                <button type="button" className={showHistory ? 'active' : undefined} onClick={() => setShowHistory((v) => !v)}>
                  Historie
                </button>
              )}
              <span className="spacer" />
              {editing ? (
                <button type="button" onClick={() => finishEditing()}>
                  Ukončit úpravy
                </button>
              ) : (
                <button type="button" className="primary" onClick={startEditing} disabled={!current}>
                  Upravit mapu
                </button>
              )}
            </div>
            {editing && (
              <EditToolbar
                data={shown}
                editor={editor}
                tool={tool}
                onToolChange={changeTool}
                newNodeTypeId={newNodeTypeId}
                onNewNodeTypeChange={setNewNodeTypeId}
                newLinkTypeId={newLinkTypeId}
                onNewLinkTypeChange={setNewLinkTypeId}
                message={message}
                onMessageChange={setMessage}
                saving={saving}
                error={saveError}
                onSave={requestSave}
                onDiscard={discardChanges}
                onFinish={() => finishEditing()}
              />
            )}
            {editing && topology && baseTopology && (
              <TopologyCheckPanel
                data={shown}
                problems={topology}
                previous={baseTopology}
                saving={saving}
                onShow={(item) => select(item, true)}
                onSave={save}
                onCancel={() => setCheckingBeforeSave(false)}
              />
            )}
            {!editing && revision && (
              <RevisionChangesPanel
                revisionId={revision}
                changes={revisionChanges}
                dimUnchanged={dimUnchanged}
                onDimUnchangedChange={setDimUnchanged}
                onShow={(change) => {
                  const item = itemRefOf(change);
                  if (!item) return;
                  // Deleted items exist only in the previous state, so they can be shown but not selected.
                  if (change.kind === 'deleted') focusItem(item, previousOfViewed);
                  else select(item, true);
                }}
              />
            )}
            {showHistory && !editing && (
              <HistoryPanel
                viewedRevision={revision}
                latestRevision={current?.revision?.id ?? null}
                onView={(id) => navigate({ selection, revision: id })}
                onClose={() => setShowHistory(false)}
              />
            )}
            {selection && (
              <DetailPanel
                data={shown}
                selection={selection}
                editor={editing ? editor : undefined}
                onSelect={select}
                onDelete={deleteSelected}
                onClose={() => select(null)}
              />
            )}
            {editing && <LinkTypesPanel data={shown} editor={editor} />}
            <details className="panel" open={!editing}>
              <summary>Legenda</summary>
              <svg
                width={LEGEND_WIDTH}
                height={legendSvgHeight}
                viewBox={`0 0 ${LEGEND_WIDTH} ${legendSvgHeight}`}
                className="legend"
              >
                <Legend
                  linkTypes={shown.linkTypes}
                  nodeTypes={shown.nodeTypes}
                  showTitle={false}
                  hiddenLinkTypeIds={hiddenLinkTypes}
                  onToggleLinkType={toggleLinkType}
                />
              </svg>
              <p className="hint">Kliknutím na typ spoje ho skryješ nebo zobrazíš.</p>
            </details>
            <AppInfo data={shown} />
          </aside>
        )}
        <main className="main">
          {error && <div className="message error">{error}</div>}
          {!shown && !error && <div className="message">Načítám mapu…</div>}
          {shown && shown.nodes.length === 0 && !editing && (
            <div className="message">Mapa je prázdná. Naimportuj data z Dia diagramu, nebo ji začni kreslit.</div>
          )}
          {shown && (
            <MapView
              ref={mapRef}
              data={shown}
              highlight={{ selection, pendingNodeId: pendingFrom, hiddenLinkTypeIds: hiddenLinkTypes, emphasis }}
              marks={marks}
              editing={editing}
              canDrag={tool === 'select'}
              cursorClass={tool !== 'select' ? 'tool-add' : undefined}
              onItemClick={onItemClick}
              onBackgroundClick={onBackgroundClick}
              onDragStart={editor.beginDrag}
              onDragMove={(item, dx, dy) => editor.dragTo((m) => moveItem(m, item, dx, dy))}
              onDragEnd={editor.endDrag}
              onPointRemove={(id) => editor.apply((m) => removeLinkPoint(m, id))}
            />
          )}
        </main>
      </div>
    </div>
  );
}
