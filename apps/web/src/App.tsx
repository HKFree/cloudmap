import { useEffect, useRef, useState } from 'react';
import type { MapData, MapLink, MapNode } from '@cloudmap/shared';
import { fetchMap } from './api';
import { DetailPanel } from './components/DetailPanel';
import { Footer } from './components/Footer';
import { SearchBox } from './components/SearchBox';
import { Legend, LEGEND_WIDTH, legendHeight } from './map/Legend';
import { MapView, type MapViewHandle } from './map/MapView';

export type Selection = { kind: 'node'; id: string } | { kind: 'link'; id: string } | null;

export function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<ReadonlySet<string>>(new Set());
  const mapRef = useRef<MapViewHandle>(null);

  useEffect(() => {
    fetchMap()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const toggleLinkType = (id: string) =>
    setHiddenLinkTypes((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const selectNode = (node: MapNode, focus = false) => {
    setSelection({ kind: 'node', id: node.id });
    if (focus) mapRef.current?.focusNode(node);
  };
  const selectLink = (link: MapLink) => setSelection({ kind: 'link', id: link.id });

  return (
    <div className="layout">
      <header className="header">
        <h1>
          hkfree <span>cloudmap</span>
        </h1>
        {data && <SearchBox nodes={data.nodes} onSelect={(node) => selectNode(node, true)} />}
        <button type="button" onClick={() => mapRef.current?.fit()} disabled={!data}>
          Celá mapa
        </button>
      </header>

      <main className="main">
        {error && <div className="message error">{error}</div>}
        {!data && !error && <div className="message">Načítám mapu…</div>}
        {data && data.nodes.length === 0 && (
          <div className="message">Mapa je prázdná. Naimportujte data z Dia diagramu.</div>
        )}
        {data && (
          <MapView
            ref={mapRef}
            data={data}
            highlight={{
              selectedNodeId: selection?.kind === 'node' ? selection.id : undefined,
              selectedLinkId: selection?.kind === 'link' ? selection.id : undefined,
              hiddenLinkTypeIds: hiddenLinkTypes,
            }}
            onNodeClick={(node) => selectNode(node)}
            onLinkClick={selectLink}
            onBackgroundClick={() => setSelection(null)}
          />
        )}

        {data && (
          <aside className="sidebar">
            {selection && (
              <DetailPanel
                data={data}
                selection={selection}
                onSelectNode={(node) => selectNode(node, true)}
                onSelectLink={selectLink}
                onClose={() => setSelection(null)}
              />
            )}
            <details className="panel" open>
              <summary>Legenda</summary>
              <svg
                width={LEGEND_WIDTH}
                height={legendHeight(data.linkTypes, data.nodeTypes, false)}
                className="legend"
              >
                <Legend
                  linkTypes={data.linkTypes}
                  nodeTypes={data.nodeTypes}
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

      <Footer data={data} />
    </div>
  );
}
