import type { ReactNode } from 'react';
import { linkShapes, type LinkShape, type MapData, type MapLabel, type MapLink, type MapNode } from '@cloudmap/shared';
import { patchItem, type ItemRef } from '../editor/operations';
import type { Editor } from '../editor/useEditor';

interface Props {
  data: MapData;
  selection: ItemRef;
  /** Present in edit mode; detail fields then become editable. */
  editor?: Editor;
  onSelect: (item: ItemRef, focus?: boolean) => void;
  onDelete: (item: ItemRef) => void;
  onClose: () => void;
}

const oneLine = (text: string) => text.replace(/\n/g, ' ');

const shapeNames: Record<LinkShape, string> = {
  straight: 'Rovná',
  arc: 'Oblouk',
  bezier: 'Křivka',
  polyline: 'Lomená',
};

export function DetailPanel(props: Props) {
  const { data, selection } = props;
  if (selection.kind === 'node') {
    const node = data.nodes.find((n) => n.id === selection.id);
    return node ? <NodeDetail {...props} node={node} /> : null;
  }
  if (selection.kind === 'link') {
    const link = data.links.find((l) => l.id === selection.id);
    return link ? <LinkDetail {...props} link={link} /> : null;
  }
  const label = data.labels.find((l) => l.id === selection.id);
  return label ? <LabelDetail {...props} label={label} /> : null;
}

function NodeDetail({ data, node, editor, onSelect, onDelete, onClose }: Props & { node: MapNode }) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const linkTypes = new Map(data.linkTypes.map((t) => [t.id, t]));
  const type = data.nodeTypes.find((t) => t.id === node.typeId);
  const links = data.links.filter((l) => l.fromNodeId === node.id || l.toNodeId === node.id);
  const edit = (patch: Partial<MapNode>, field: string) =>
    editor?.apply((m) => patchItem(m, 'nodes', node.id, patch), `node:${node.id}:${field}`);

  return (
    <section className="panel detail">
      <PanelHeader title={oneLine(node.label) || '(bez názvu)'} onClose={onClose} />
      {editor ? (
        <div className="form">
          <Field label="Název">
            <textarea rows={2} value={node.label} onChange={(e) => edit({ label: e.target.value }, 'label')} />
          </Field>
          <Field label="Typ">
            <select value={node.typeId} onChange={(e) => edit({ typeId: e.target.value }, 'type')}>
              {data.nodeTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-row">
            <NumberField label="Šířka" value={node.width} onChange={(width) => edit({ width }, 'width')} />
            <NumberField label="Výška" value={node.height} onChange={(height) => edit({ height }, 'height')} />
            <NumberField label="Písmo" value={node.fontSize} min={4} onChange={(fontSize) => edit({ fontSize }, 'font')} />
          </div>
          <Field label="Poznámka">
            <textarea rows={3} value={node.note} onChange={(e) => edit({ note: e.target.value }, 'note')} />
          </Field>
          <button type="button" className="danger" onClick={() => onDelete({ kind: 'node', id: node.id })}>
            Smazat uzel{links.length > 0 && ` i se spoji (${links.length})`}
          </button>
        </div>
      ) : (
        <>
          <p className="muted">{type?.name}</p>
          {node.note && <p className="note">{node.note}</p>}
        </>
      )}

      <h3>Spoje ({links.length})</h3>
      {links.length === 0 && <p className="muted">Žádné spoje</p>}
      <ul className="link-list">
        {links.map((link) => {
          const otherId = link.fromNodeId === node.id ? link.toNodeId : link.fromNodeId;
          const linkType = linkTypes.get(link.typeId);
          return (
            <li key={link.id}>
              <span className="swatch" style={{ background: linkType?.color }} title={linkType?.name} />
              <button type="button" onClick={() => onSelect({ kind: 'node', id: otherId }, true)}>
                {oneLine(nodes.get(otherId)?.label || '(bez názvu)')}
              </button>
              <button type="button" className="muted" onClick={() => onSelect({ kind: 'link', id: link.id }, true)}>
                {[linkType?.name, link.capacity, link.technology].filter(Boolean).join(', ')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LinkDetail({ data, link, editor, onSelect, onDelete, onClose }: Props & { link: MapLink }) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const linkType = data.linkTypes.find((t) => t.id === link.typeId);
  const nodeName = (id: string) => oneLine(nodes.get(id)?.label || '(bez názvu)');
  const technologies = [...new Set(data.links.map((l) => l.technology).filter(Boolean))].sort();
  const edit = (patch: Partial<MapLink>, field: string) =>
    editor?.apply((m) => patchItem(m, 'links', link.id, patch), `link:${link.id}:${field}`);

  const changeShape = (shape: LinkShape) => {
    // Bend points belong to curves and polylines only; an arc starts with a gentle bulge.
    const keepPoints = shape === link.shape;
    edit({ shape, points: keepPoints ? link.points : [], curvature: shape === 'arc' ? link.curvature || 0.15 : 0 }, 'shape');
  };
  const availableShapes = linkShapes.filter((s) => s === 'straight' || s === 'arc' || s === link.shape);

  return (
    <section className="panel detail">
      <PanelHeader title="Spoj" onClose={onClose} />
      <p>
        <button type="button" onClick={() => onSelect({ kind: 'node', id: link.fromNodeId }, true)}>
          {nodeName(link.fromNodeId)}
        </button>
        {' ↔ '}
        <button type="button" onClick={() => onSelect({ kind: 'node', id: link.toNodeId }, true)}>
          {nodeName(link.toNodeId)}
        </button>
      </p>

      {editor ? (
        <div className="form">
          <Field label="Typ spoje">
            <select value={link.typeId} onChange={(e) => edit({ typeId: e.target.value }, 'type')}>
              {data.linkTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Kapacita">
              <input value={link.capacity} placeholder="např. 1Gbps" onChange={(e) => edit({ capacity: e.target.value }, 'capacity')} />
            </Field>
            <Field label="Technologie">
              <input
                value={link.technology}
                list="technologies"
                placeholder="např. 10GHz"
                onChange={(e) => edit({ technology: e.target.value }, 'technology')}
              />
              <datalist id="technologies">
                {technologies.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="field-row">
            <Field label="Tvar">
              <select value={link.shape} onChange={(e) => changeShape(e.target.value as LinkShape)}>
                {availableShapes.map((s) => (
                  <option key={s} value={s}>
                    {shapeNames[s]}
                  </option>
                ))}
              </select>
            </Field>
            {link.shape === 'arc' && (
              <NumberField label="Prohnutí" value={link.curvature} step={0.05} onChange={(curvature) => edit({ curvature }, 'curvature')} />
            )}
          </div>
          <Field label="Poznámka">
            <textarea rows={3} value={link.note} onChange={(e) => edit({ note: e.target.value }, 'note')} />
          </Field>
          {link.labelX !== null && (
            <button type="button" onClick={() => edit({ labelX: null, labelY: null }, 'label-reset')}>
              Popisek doprostřed spoje
            </button>
          )}
          <button type="button" className="danger" onClick={() => onDelete({ kind: 'link', id: link.id })}>
            Smazat spoj
          </button>
        </div>
      ) : (
        <dl>
          <dt>Typ</dt>
          <dd>
            <span className="swatch" style={{ background: linkType?.color }} /> {linkType?.name}
          </dd>
          <dt>Kapacita</dt>
          <dd>{link.capacity || '–'}</dd>
          <dt>Technologie</dt>
          <dd>{link.technology || '–'}</dd>
          {link.note && (
            <>
              <dt>Poznámka</dt>
              <dd className="note">{link.note}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

function LabelDetail({ label, editor, onDelete, onClose }: Props & { label: MapLabel }) {
  const edit = (patch: Partial<MapLabel>, field: string) =>
    editor?.apply((m) => patchItem(m, 'labels', label.id, patch), `label:${label.id}:${field}`);

  return (
    <section className="panel detail">
      <PanelHeader title="Popisek" onClose={onClose} />
      {editor ? (
        <div className="form">
          <Field label="Text">
            <textarea rows={3} value={label.text} onChange={(e) => edit({ text: e.target.value }, 'text')} />
          </Field>
          <div className="field-row">
            <NumberField label="Písmo" value={label.fontSize} min={4} onChange={(fontSize) => edit({ fontSize }, 'font')} />
            <Field label="Barva">
              <input type="color" value={label.color} onChange={(e) => edit({ color: e.target.value }, 'color')} />
            </Field>
            <Field label="Zarovnání">
              <select value={label.align} onChange={(e) => edit({ align: e.target.value as MapLabel['align'] }, 'align')}>
                <option value="left">Vlevo</option>
                <option value="center">Na střed</option>
                <option value="right">Vpravo</option>
              </select>
            </Field>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={label.bold} onChange={(e) => edit({ bold: e.target.checked }, 'bold')} /> Tučně
          </label>
          <button type="button" className="danger" onClick={() => onDelete({ kind: 'label', id: label.id })}>
            Smazat popisek
          </button>
        </div>
      ) : (
        <p className="note">{label.text}</p>
      )}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={step < 1 ? undefined : min}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </Field>
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
