import { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react';
import type { Decision, Snapshot } from '../domain/schema';
import { contractChanges } from '../domain/changes';
import { reviewBaseline } from './client';
import { SourceLink, Tag } from './ui';
import { useDialogFocus } from './useDialogFocus';

export function SourceReview({
  snapshot,
  decision,
  onClose,
  onAdopted,
}: {
  snapshot: Snapshot;
  decision: Decision;
  onClose: () => void;
  onAdopted: (next: Snapshot) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useDialogFocus<HTMLDivElement>(onClose, busy);
  const changes = contractChanges(decision.contract, decision.currentContract ?? decision.contract);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      onAdopted(await reviewBaseline(snapshot, decision.pageId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The baseline could not be adopted.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        className="modal source-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-top">
          <span className="little-spark">
            <ShieldCheck size={20} />
          </span>
          <button
            className="icon-button"
            aria-label="Close source review"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <div className="eyebrow">REVIEW THE CHANGE, KEEP THE CONTEXT</div>
        <h2 id="source-review-title">What changed in this decision?</h2>
        <p>{decision.title}</p>
        <div className="source-version-pills">
          <Tag>Reviewed v{decision.reviewedVersion}</Tag>
          <ArrowRight size={16} />
          <Tag tone="critical">Current v{decision.currentVersion}</Tag>
        </div>
        <div className="source-excerpts">
          <section>
            <h3>Previously reviewed source</h3>
            <p>{decision.reviewedExcerpt}</p>
          </section>
          <section>
            <h3>Current source</h3>
            <p>{decision.currentExcerpt}</p>
          </section>
        </div>
        <div className="contract-diff">
          <h3>
            Changes to explicit commitments <Tag>{changes.length}</Tag>
          </h3>
          {changes.length ? (
            changes.map((change) => (
              <article key={change.field}>
                <div>
                  <strong>{change.field}</strong>
                  <Tag tone={change.kind === 'removed' ? 'critical' : 'success'}>{change.kind}</Tag>
                </div>
                <p>
                  <span>Before</span>
                  {change.before}
                </p>
                <p>
                  <span>Now</span>
                  {change.after}
                </p>
              </article>
            ))
          ) : (
            <p className="fineprint">
              The parsed contract has not changed. The page may have edits outside its JSON block.
              Inspect the full Confluence page before adopting this version.
            </p>
          )}
        </div>
        <SourceLink url={decision.url} demo={snapshot.mode === 'demo'}>
          Inspect the full source page
        </SourceLink>
        <label className="confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I inspected the source and the applicable work. Adopt v{decision.currentVersion} as this
            release’s reviewed baseline. Other open prerequisites and ownership signals will still
            be evaluated.
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <span>
            {snapshot.mode === 'demo'
              ? 'Local demo baseline only'
              : 'Updates the shared Jira review configuration'}
          </span>
          <button
            className="button primary"
            disabled={!confirmed || busy || !decision.accessible}
            onClick={submit}
          >
            <Check size={16} />
            {busy ? 'Adopting…' : `Adopt reviewed v${decision.currentVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
