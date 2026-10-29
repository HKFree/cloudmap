import { useEffect, useState } from 'react';
import type { ChangeCounts, RevisionSummary } from '@cloudmap/shared';
import { fetchRevisions } from '../api';

const dateFormat = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });

const collectionNames: Record<keyof RevisionSummary['changes'], string> = {
  nodes: 'uzly',
  links: 'spoje',
  labels: 'popisky',
  linkTypes: 'typy spojů',
  nodeTypes: 'typy uzlů',
};

function summary(changes: RevisionSummary['changes']): string {
  const format = ({ added, changed, deleted }: ChangeCounts) =>
    [added && `+${added}`, changed && `~${changed}`, deleted && `−${deleted}`].filter(Boolean).join(' ');
  const parts = (Object.keys(collectionNames) as (keyof RevisionSummary['changes'])[])
    .map((key) => [collectionNames[key], format(changes[key])])
    .filter(([, counts]) => counts)
    .map(([name, counts]) => `${name} ${counts}`);
  return parts.join(', ') || 'beze změn';
}

interface Props {
  viewedRevision: number | null;
  latestRevision: number | null;
  onView: (revision: number | null) => void;
  onClose: () => void;
}

export function HistoryPanel({ viewedRevision, latestRevision, onView, onClose }: Props) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRevisions()
      .then(setRevisions)
      .catch((e: Error) => setError(e.message));
  }, [latestRevision]);

  return (
    <section className="panel history">
      <div className="panel-header">
        <h2>Historie změn</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!revisions && !error && <p className="muted">Načítám…</p>}
      <ol className="revision-list">
        {revisions?.map((revision) => {
          const isLatest = revision.id === latestRevision;
          const isViewed = revision.id === viewedRevision;
          return (
            <li key={revision.id} className={isViewed ? 'active' : undefined}>
              <button type="button" onClick={() => onView(revision.id)}>
                <strong>#{revision.id}</strong> {revision.message || '(bez popisu)'}
                {isLatest && <span className="badge">aktuální</span>}
              </button>
              <div className="muted small">
                {dateFormat.format(new Date(revision.createdAt))}
                {revision.author && ` · ${revision.author}`} · {summary(revision.changes)}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
