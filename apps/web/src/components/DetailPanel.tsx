import type { ReactNode } from 'react';
import { linkShapes, type LinkShape, type MapData, type MapLabel, type MapLink, type MapNode } from '@cloudmap/shared';
import { areaMembers, changeLinkShape, DEFAULT_CORNER_RADIUS, isArea, patchItem, type ItemRef } from '../editor/operations';
import { textBlockWidth } from '../map/MultilineText';
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

const alignOffset: Record<MapLabel['align'], number> = { left: 0, center: 0.5, right: 1 };

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
  const members = isArea(data, node) ? data.nodes.filter((n) => areaMembers(data, node).has(n.id) && n.label) : [];
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
            <NumberField label="Velikost písma" value={node.fontSize} min={4} onChange={(fontSize) => edit({ fontSize }, 'font')} />
            <span className="field hint">Velikost uzlu změníte tažením rohů v mapě.</span>
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

      {members.length > 0 && (
        <>
          <h3>V oblasti ({members.length})</h3>
          <ul className="chip-list">
            {members.map((member) => (
              <li key={member.id}>
                <button type="button" onClick={() => onSelect({ kind: 'node', id: member.id }, true)}>
                  {oneLine(member.label)}
                </button>
              </li>
            ))}
          </ul>
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
                {[linkType?.name, link.capacity].filter(Boolean).join(', ')}
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
  const edit = (patch: Partial<MapLink>, field: string) =>
    editor?.apply((m) => patchItem(m, 'links', link.id, patch), `link:${link.id}:${field}`);
  const changeShape = (shape: LinkShape) => editor?.apply((m) => changeLinkShape(m, link.id, shape));
  // Bezier curves come only from the import; new ones cannot be drawn yet.
  const availableShapes = linkShapes.filter((s) => s !== 'bezier' || s === link.shape);
  const remote = linkType?.remote ?? false;

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
          <Field label="Kapacita">
            <input value={link.capacity} placeholder="např. 1Gbps" onChange={(e) => edit({ capacity: e.target.value }, 'capacity')} />
          </Field>
          {remote ? (
            <p className="hint">
              Vzdálený spoj se kreslí jen jako dva konce u svých uzlů. Konce lze v mapě přetáhnout, dvojklikem se vrátí na
              výchozí místo.
            </p>
          ) : (
            <>
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
                {link.shape === 'polyline' && (
                  <Field label={`Zaoblení rohů (${link.cornerRadius} px)`}>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(100, DEFAULT_CORNER_RADIUS * 5)}
                      value={link.cornerRadius}
                      onChange={(e) => edit({ cornerRadius: Number(e.target.value) }, 'corner-radius')}
                    />
                  </Field>
                )}
              </div>
              {link.shape === 'polyline' && (
                <p className="hint">Body lomu přesunete tažením, tažením „+“ přidáte nový bod, dvojklikem bod odeberete.</p>
              )}
            </>
          )}
          <Field label="Poznámka">
            <textarea rows={3} value={link.note} onChange={(e) => edit({ note: e.target.value }, 'note')} />
          </Field>
          {link.labelX !== null && (
            <button type="button" onClick={() => edit({ labelX: null, labelY: null }, 'label-reset')}>
              Vycentrovat popisek spoje
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

  // The anchor moves with the alignment, so the text block stays where it is and only its lines realign.
  const changeAlign = (align: MapLabel['align']) => {
    const width = textBlockWidth(label.text, label.fontSize, label.bold);
    const left = label.x - alignOffset[label.align] * width;
    edit({ align, x: Math.round((left + alignOffset[align] * width) * 10) / 10 }, 'align');
  };

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
              <select value={label.align} onChange={(e) => changeAlign(e.target.value as MapLabel['align'])}>
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
