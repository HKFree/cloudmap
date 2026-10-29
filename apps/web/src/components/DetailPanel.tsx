import type { MapData, MapLink, MapNode } from '@cloudmap/shared';
import type { Selection } from '../App';

interface Props {
  data: MapData;
  selection: NonNullable<Selection>;
  onSelectNode: (node: MapNode) => void;
  onSelectLink: (link: MapLink) => void;
  onClose: () => void;
}

const oneLine = (text: string) => text.replace(/\n/g, ' ');

export function DetailPanel({ data, selection, onSelectNode, onSelectLink, onClose }: Props) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const linkTypes = new Map(data.linkTypes.map((t) => [t.id, t]));
  const nodeName = (id: string) => oneLine(nodes.get(id)?.label || '(bez názvu)');

  if (selection.kind === 'node') {
    const node = nodes.get(selection.id);
    if (!node) return null;
    const type = data.nodeTypes.find((t) => t.id === node.typeId);
    const links = data.links.filter((l) => l.fromNodeId === node.id || l.toNodeId === node.id);
    return (
      <section className="panel detail">
        <PanelHeader title={oneLine(node.label) || '(bez názvu)'} onClose={onClose} />
        <p className="muted">{type?.name}</p>
        {node.note && <p>{node.note}</p>}
        <h3>Spoje ({links.length})</h3>
        {links.length === 0 && <p className="muted">Žádné spoje</p>}
        <ul className="link-list">
          {links.map((link) => {
            const otherId = link.fromNodeId === node.id ? link.toNodeId : link.fromNodeId;
            const other = nodes.get(otherId);
            const linkType = linkTypes.get(link.typeId);
            return (
              <li key={link.id}>
                <span className="swatch" style={{ background: linkType?.color }} title={linkType?.name} />
                <button type="button" onClick={() => other && onSelectNode(other)}>
                  {nodeName(otherId)}
                </button>
                <button type="button" className="muted" onClick={() => onSelectLink(link)}>
                  {linkType?.name}
                  {link.capacity && `, ${oneLine(link.capacity)}`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const link = data.links.find((l) => l.id === selection.id);
  if (!link) return null;
  const linkType = linkTypes.get(link.typeId);
  const from = nodes.get(link.fromNodeId);
  const to = nodes.get(link.toNodeId);
  return (
    <section className="panel detail">
      <PanelHeader title="Spoj" onClose={onClose} />
      <p>
        <button type="button" onClick={() => from && onSelectNode(from)}>
          {nodeName(link.fromNodeId)}
        </button>
        {' ↔ '}
        <button type="button" onClick={() => to && onSelectNode(to)}>
          {nodeName(link.toNodeId)}
        </button>
      </p>
      <dl>
        <dt>Typ</dt>
        <dd>
          <span className="swatch" style={{ background: linkType?.color }} /> {linkType?.name}
        </dd>
        <dt>Kapacita</dt>
        <dd>{link.capacity ? oneLine(link.capacity) : '–'}</dd>
        {link.note && (
          <>
            <dt>Poznámka</dt>
            <dd>{link.note}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <button type="button" className="close" onClick={onClose} aria-label="Zavřít">
        ×
      </button>
    </div>
  );
}
