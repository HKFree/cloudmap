import { hasTopologyProblems, type MapData, type TopologyProblems } from '@cloudmap/shared';
import type { ItemRef } from './operations';

interface Props {
  data: MapData;
  problems: TopologyProblems;
  /** Problems present before editing started; the rest are marked as new. */
  previous: TopologyProblems;
  saving: boolean;
  onShow: (item: ItemRef) => void;
  onSave: () => void;
  onCancel: () => void;
}

const oneLine = (text: string) => text.replace(/\n/g, ' ').trim();

/** Shown when saving finds loose links or sites cut off from the core; saving anyway stays possible. */
export function TopologyCheckPanel({ data, problems, previous, saving, onShow, onSave, onCancel }: Props) {
  const nodeName = (id: string) => oneLine(data.nodes.find((n) => n.id === id)?.label ?? '') || '(bod)';
  const linkName = (id: string) => {
    const link = data.links.find((l) => l.id === id);
    return link ? `${nodeName(link.fromNodeId)} ↔ ${nodeName(link.toNodeId)}` : id;
  };
  const wasLoose = new Set(previous.looseLinks);
  const wasUnreachable = new Set(previous.unreachableNodes);
  const newCount =
    problems.looseLinks.filter((id) => !wasLoose.has(id)).length + problems.unreachableNodes.filter((id) => !wasUnreachable.has(id)).length;
  const ok = !hasTopologyProblems(problems);

  return (
    <section className={`panel check-panel${ok ? ' ok' : ''}`}>
      <div className="panel-header">
        <h2>{ok ? 'Kontrola v pořádku' : 'Kontrola sítě před uložením'}</h2>
      </div>
      {ok ? (
        <p>Všechny spoje jsou připojené a všechny lokality mají cestu do 4 PMV IGW.</p>
      ) : (
        <p>
          {newCount > 0
            ? `Úpravy přinesly ${newCount} ${newCount === 1 ? 'nový problém' : newCount < 5 ? 'nové problémy' : 'nových problémů'}.`
            : 'Úpravy nepřinesly nové problémy, tyto existovaly už dříve.'}{' '}
          Problémová místa jsou v mapě zvýrazněná červeně.
        </p>
      )}

      {problems.coreMissing && <p className="error">Chybí centrální uzel 4 PMV IGW.</p>}
      <ProblemList
        title="Nepřipojené spoje"
        hint="Aspoň jeden konec spoje nevede do žádného uzlu."
        ids={problems.looseLinks}
        isNew={(id) => !wasLoose.has(id)}
        name={linkName}
        onShow={(id) => onShow({ kind: 'link', id })}
      />
      <ProblemList
        title="Lokality bez cesty do 4 PMV IGW"
        ids={problems.unreachableNodes}
        isNew={(id) => !wasUnreachable.has(id)}
        name={nodeName}
        onShow={(id) => onShow({ kind: 'node', id })}
      />

      <div className="toolbar-row">
        <button type="button" className={ok ? 'primary' : 'danger'} disabled={saving} onClick={onSave}>
          {saving ? 'Ukládám…' : ok ? 'Uložit' : 'Přesto uložit'}
        </button>
        <button type="button" onClick={onCancel}>
          Zpět k úpravám
        </button>
      </div>
    </section>
  );
}

function ProblemList({
  title,
  hint,
  ids,
  isNew,
  name,
  onShow,
}: {
  title: string;
  hint?: string;
  ids: string[];
  isNew: (id: string) => boolean;
  name: (id: string) => string;
  onShow: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  // New problems are the ones the user most likely wants to fix; older ones stay folded.
  const fresh = ids.filter(isNew);
  const older = ids.filter((id) => !isNew(id));
  const list = (items: string[], badge: boolean) => (
    <ul className="change-list">
      {items.map((id) => (
        <li key={id}>
          <button type="button" className="link-button" onClick={() => onShow(id)}>
            {name(id)}
          </button>
          {badge && <span className="badge new">nové</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <h3 title={hint}>
        {title} ({ids.length})
      </h3>
      {list(fresh, true)}
      {older.length > 0 && (
        <details className="older-problems">
          <summary className="muted small">Existovaly už před úpravou ({older.length})</summary>
          {list(older, false)}
        </details>
      )}
    </>
  );
}
