import type { MapCollection } from '@cloudmap/shared';
import { MARK_COLORS } from '../map/MarksOverlay';
import { itemRefOf, type ChangeKind, type ItemChange } from './revisionChanges';

interface Props {
  revisionId: number;
  changes: ItemChange[] | null;
  dimUnchanged: boolean;
  onDimUnchangedChange: (dim: boolean) => void;
  onShow: (change: ItemChange) => void;
  /** Leaves the revision and returns to the current map. */
  onClose: () => void;
}

const kindLabels: Record<ChangeKind, string> = { added: 'přidáno', changed: 'změněno', deleted: 'smazáno' };
const kindSigns: Record<ChangeKind, string> = { added: '+', changed: '~', deleted: '−' };
const collectionLabels: Record<MapCollection, string> = {
  nodes: 'Uzly',
  links: 'Spoje',
  labels: 'Popisky',
  linkTypes: 'Typy spojů',
  nodeTypes: 'Typy uzlů',
};

export function RevisionChangesPanel({ revisionId, changes, dimUnchanged, onDimUnchangedChange, onShow, onClose }: Props) {
  const groups = (Object.keys(collectionLabels) as MapCollection[])
    .map((collection) => ({ collection, items: changes?.filter((c) => c.collection === collection) ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Změny v revizi #{revisionId}</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Zpět na aktuální mapu" title="Zpět na aktuální mapu">
          ×
        </button>
      </div>
      <ul className="change-legend">
        {(Object.keys(kindLabels) as ChangeKind[]).map((kind) => (
          <li key={kind}>
            <span className="swatch" style={{ background: MARK_COLORS[kind] }} /> {kindLabels[kind]}
          </li>
        ))}
      </ul>
      <label className="checkbox small">
        <input type="checkbox" checked={dimUnchanged} onChange={(e) => onDimUnchangedChange(e.target.checked)} /> Ztlumit nezměněné
      </label>
      {!changes && <p className="muted">Načítám…</p>}
      {changes?.length === 0 && <p className="muted">Revize nic nezměnila.</p>}
      {groups.map(({ collection, items }) => (
        <div key={collection}>
          <h3>
            {collectionLabels[collection]} ({items.length})
          </h3>
          <ul className="change-list">
            {items.map((change) => (
              <li key={change.id}>
                <span className="change-sign" style={{ color: MARK_COLORS[change.kind] }} title={kindLabels[change.kind]}>
                  {kindSigns[change.kind]}
                </span>
                <div>
                  {itemRefOf(change) ? (
                    <button type="button" className="link-button" onClick={() => onShow(change)}>
                      {change.title}
                    </button>
                  ) : (
                    change.title
                  )}
                  {change.details.length > 0 && <div className="muted small">{change.details.join(', ')}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
