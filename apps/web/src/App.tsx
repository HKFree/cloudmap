import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapData, Point } from '@cloudmap/shared';
import { fetchMap, restoreRevision, saveChanges } from './api';
import { DetailPanel } from './components/DetailPanel';
import { Footer } from './components/Footer';
import { HistoryPanel } from './components/HistoryPanel';
import { SearchBox } from './components/SearchBox';
import { EditToolbar, type Tool } from './editor/EditToolbar';
import { LinkTypesPanel } from './editor/LinkTypesPanel';
import { createLabel, createLink, createNode, deleteItem, moveItem, upsertItem, type ItemRef } from './editor/operations';
import { useEditor } from './editor/useEditor';
import { useHashState } from './hash';
import type { Bounds } from './map/geometry';
import { Legend, LEGEND_WIDTH, legendHeight } from './map/Legend';
import { MapView, type MapViewHandle } from './map/MapView';

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
  if (!from || !to) return null;
  const padding = 150;
  return {
    minX: Math.min(from.x, to.x) - padding,
    minY: Math.min(from.y, to.y) - padding,
    maxX: Math.max(from.x, to.x) + padding,
    maxY: Math.max(from.y, to.y) + padding,
  };
}

export function App() {
  const [current, setCurrent] = useState<MapData | null>(null);
  const [viewed, setViewed] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<ReadonlySet<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);

  const editor = useEditor();
  const [tool, setTool] = useState<Tool>('select');
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [newNodeTypeId, setNewNodeTypeId] = useState('ap5');
  const [newLinkTypeId, setNewLinkTypeId] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (revision) fetchMap(revision).then(setViewed).catch((e: Error) => setError(e.message));
  }, [revision]);

  const focusItem = (item: ItemRef, map: MapData | null = shown) => {
    const bounds = map && itemBounds(map, item);
    if (bounds) mapRef.current?.focus(bounds);
  };

  const select = (item: ItemRef | null, focus = false) => {
    navigate({ selection: item, revision });
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
    editor.start(current);
  };

  const finishEditing = () => {
    if (editor.changeCount > 0 && !confirm('Máte neuložené změny. Opravdu je zahodit?')) return;
    editor.stop();
    changeTool('select');
  };

  const discardChanges = () => {
    if (!editor.base || !confirm('Zahodit všechny neuložené změny?')) return;
    editor.start(editor.base);
  };

  const save = async () => {
    if (!editor.changes || !editor.base) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveChanges({ baseRevisionId: editor.base.revision?.id ?? null, message, ...editor.changes });
      editor.start(await reload());
      setMessage('');
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
      if (typing || !editing) return;
      const key = e.key.toLowerCase();
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

  const toggleLinkType = (id: string) =>
    setHiddenLinkTypes((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="layout">
      <header className="header">
        <h1>
          hkfree <span>cloudmap</span>
        </h1>
        {shown && <SearchBox nodes={shown.nodes} onSelect={(node) => select({ kind: 'node', id: node.id }, true)} />}
        <button type="button" onClick={() => mapRef.current?.fit()} disabled={!shown}>
          Celá mapa
        </button>
        <span className="spacer" />
        <button type="button" className={showHistory ? 'active' : undefined} onClick={() => setShowHistory((v) => !v)}>
          Historie
        </button>
        {!editing && (
          <button type="button" className="primary" onClick={startEditing} disabled={!current}>
            Upravit mapu
          </button>
        )}
      </header>

      {editing && shown && (
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
          onSave={save}
          onDiscard={discardChanges}
          onFinish={finishEditing}
        />
      )}

      {!editing && revision && (
        <div className="banner">
          {viewed?.revision ? (
            <>
              Prohlížíte starší verzi mapy: revize #{viewed.revision.id} z {dateFormat.format(new Date(viewed.revision.createdAt))}
              {viewed.revision.message && ` – ${viewed.revision.message}`}
            </>
          ) : (
            <>Načítám revizi #{revision}…</>
          )}
          <span className="spacer" />
          <button type="button" onClick={restore} disabled={!viewed}>
            Obnovit tuto verzi
          </button>
          <button type="button" onClick={() => navigate({ selection, revision: null })}>
            Zobrazit aktuální
          </button>
        </div>
      )}

      <main className="main">
        {error && <div className="message error">{error}</div>}
        {!shown && !error && <div className="message">Načítám mapu…</div>}
        {shown && shown.nodes.length === 0 && !editing && (
          <div className="message">Mapa je prázdná. Naimportujte data z Dia diagramu, nebo ji začněte kreslit.</div>
        )}
        {shown && (
          <MapView
            ref={mapRef}
            data={shown}
            highlight={{ selection, pendingNodeId: pendingFrom, hiddenLinkTypeIds: hiddenLinkTypes }}
            editing={editing}
            canDrag={tool === 'select'}
            cursorClass={tool !== 'select' ? 'tool-add' : undefined}
            onItemClick={onItemClick}
            onBackgroundClick={onBackgroundClick}
            onDragStart={editor.beginDrag}
            onDragMove={(item, dx, dy) => editor.dragTo((m) => moveItem(m, item, dx, dy))}
            onDragEnd={editor.endDrag}
          />
        )}

        {shown && (
          <aside className="sidebar">
            {showHistory && (
              <HistoryPanel
                viewedRevision={revision}
                latestRevision={current?.revision?.id ?? null}
                onView={(id) => {
                  if (editing && id !== null) return alert('Starší verze lze prohlížet až po ukončení úprav.');
                  navigate({ selection, revision: id });
                }}
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
              <svg width={LEGEND_WIDTH} height={legendHeight(shown.linkTypes, shown.nodeTypes, false)} className="legend">
                <Legend
                  linkTypes={shown.linkTypes}
                  nodeTypes={shown.nodeTypes}
                  showTitle={false}
                  hiddenLinkTypeIds={hiddenLinkTypes}
                  onToggleLinkType={toggleLinkType}
                />
              </svg>
              <p className="hint">Kliknutím na typ spoje jej skryjete nebo zobrazíte.</p>
            </details>
          </aside>
        )}
      </main>

      <Footer data={shown} />
    </div>
  );
}
