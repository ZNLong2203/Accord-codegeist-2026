import { useEffect, useRef, useState } from 'react';
import { History, MessageSquare, RefreshCw } from 'lucide-react';
import type { DecisionRecord, Snapshot } from '../domain/schema';
import { getHistory, isLive } from './client';
import { SourceLink, Tag, time } from './ui';

export function HistoryPanel({
  snapshot,
  revision,
  query,
  onFirstReview,
}: {
  snapshot: Snapshot;
  revision: number;
  query: string;
  onFirstReview: () => void;
}) {
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  async function load(startAt = 0) {
    const ticket = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await getHistory(snapshot.release.anchorIssue, startAt);
      if (ticket !== generation.current) return;
      setRecords((previous) => [
        ...new Map(
          [...(startAt ? previous : []), ...result.records].map((record) => [record.id, record]),
        ).values(),
      ]);
      setCursor(result.nextStartAt);
    } catch (e) {
      if (ticket === generation.current)
        setError(e instanceof Error ? e.message : 'Could not load review history.');
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    setRecords([]);
    void load();
    return () => {
      generation.current++;
    };
  }, [snapshot.release.anchorIssue, revision]);
  const filtered = records.filter((item) =>
    `${item.rationale} ${item.actor}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel history-panel">
      <div className="history-toolbar">
        <div>
          <h2>{isLive ? 'Shared Jira review history' : 'Your local demo reviews'}</h2>
          <p>
            {isLive
              ? 'Visible Accord comments, read with your Jira permissions.'
              : 'Saved in this browser. Refreshing keeps your reasoning.'}
          </p>
        </div>
        <button className="button secondary compact" disabled={busy} onClick={() => load()}>
          <RefreshCw size={15} />
          Refresh history
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => load()}>Retry</button>
        </div>
      )}
      {busy && !records.length && (
        <div className="empty-state">
          <p>Reading visible review records…</p>
        </div>
      )}
      {filtered.map((item) => (
        <article className="history-item" key={item.id}>
          <span className="history-mark">
            <MessageSquare size={18} />
          </span>
          <div>
            <div className="history-title">
              <h3>
                {item.outcome === 'hold'
                  ? 'Release held for review'
                  : 'Proceed with conditions recorded'}
              </h3>
              <Tag tone={isLive ? 'success' : 'neutral'}>
                {isLive ? 'Jira comment' : 'Local demo record'}
              </Tag>
            </div>
            <p>{item.rationale}</p>
            <div className="history-meta">
              <span>{item.actor}</span>
              <span>{time(item.recordedAt)}</span>
              <code>{item.snapshotId}</code>
              <span>{item.findingCount} signals at review</span>
            </div>
            {item.url && (
              <SourceLink url={item.url} demo={false}>
                Open comment in Jira
              </SourceLink>
            )}
          </div>
        </article>
      ))}
      {!busy && !error && !filtered.length && (
        <div className="empty-state tall">
          <History size={36} />
          <h2>{query ? 'No reviews match this search.' : 'A good decision deserves a record.'}</h2>
          <p>
            {query
              ? 'Try a different reviewer or phrase.'
              : 'Review the evidence and leave a useful trail for the next person.'}
          </p>
          {!query && (
            <button className="button primary" onClick={onFirstReview}>
              Record your first review
            </button>
          )}
        </div>
      )}
      {cursor !== null && (
        <div className="history-pagination">
          <p>Some older comment pages may contain no Accord records.</p>
          <button className="button secondary" disabled={busy} onClick={() => load(cursor)}>
            {busy ? 'Loading…' : 'Read older comments'}
          </button>
        </div>
      )}
    </section>
  );
}
