import { useMemo, useState } from 'react';
import { ArrowRight, Check, CircleSlash, Quote, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Decision, Rule, Snapshot } from '../domain/schema';
import { ruleLabel } from '../domain/changes';
import { containsQuote, likelyReplacement, sentenceDiff } from '../domain/text';
import { confirmAndAdopt, draftCommitments, type CommitmentDraft } from './client';
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
  const [busy, setBusy] = useState<'' | 'draft' | 'adopt'>('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<CommitmentDraft | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [showSame, setShowSame] = useState(false);
  const panel = useDialogFocus<HTMLDivElement>(onClose, Boolean(busy));

  const hasText = decision.reviewedText !== undefined && decision.currentText !== undefined;
  const changes = useMemo(
    () => (hasText ? sentenceDiff(decision.reviewedText!, decision.currentText!) : []),
    [decision, hasText],
  );
  const changed = changes.filter((change) => change.kind !== 'same');
  const unchangedCount = changes.length - changed.length;

  async function runDraft() {
    setBusy('draft');
    setError('');
    try {
      const result = await draftCommitments(snapshot, decision.pageId);
      setDraft(result);
      setChosen(new Set(result.draft.accepted.map((rule) => rule.id)));
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The commitments could not be drafted.');
    } finally {
      setBusy('');
    }
  }

  async function adopt() {
    if (!draft) return;
    setBusy('adopt');
    setError('');
    try {
      const rules = draft.draft.accepted.filter((rule) => chosen.has(rule.id));
      onAdopted(
        await confirmAndAdopt(snapshot, decision.pageId, {
          pageVersion: draft.pageVersion,
          title: draft.draft.title,
          owner: draft.draft.owner,
          appliesTo: draft.draft.appliesTo.length
            ? draft.draft.appliesTo
            : decision.contract.appliesTo,
          rules,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The commitments could not be confirmed.');
    } finally {
      setBusy('');
    }
  }

  const ruleCount = chosen.size;
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
            disabled={Boolean(busy)}
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

        <section className="review-step">
          <h3>
            <span className="step-number">1</span>The page, sentence by sentence
            <Tag>{changed.length} changed</Tag>
          </h3>
          {hasText ? (
            <div className="sentence-diff">
              {changed.length === 0 && (
                <p className="fineprint">Only formatting changed between these versions.</p>
              )}
              {changes.map((change, index) =>
                change.kind === 'same' ? (
                  showSame ? (
                    <p key={index} className="sentence same">
                      {change.text}
                    </p>
                  ) : null
                ) : (
                  <p key={index} className={`sentence ${change.kind}`}>
                    <span className="sentence-mark" aria-hidden="true">
                      {change.kind === 'added' ? '+' : '−'}
                    </span>
                    <span className="visually-hidden">
                      {change.kind === 'added' ? 'Added: ' : 'Removed: '}
                    </span>
                    {change.text}
                  </p>
                ),
              )}
              {unchangedCount > 0 && (
                <button className="text-button" onClick={() => setShowSame((v) => !v)}>
                  {showSame ? 'Hide' : 'Show'} {unchangedCount} unchanged sentence
                  {unchangedCount === 1 ? '' : 's'}
                </button>
              )}
            </div>
          ) : (
            <div className="source-excerpts">
              <section>
                <h4>Previously reviewed</h4>
                <p>{decision.reviewedExcerpt}</p>
              </section>
              <section>
                <h4>Current</h4>
                <p>{decision.currentExcerpt}</p>
              </section>
            </div>
          )}
        </section>

        <section className="review-step">
          <h3>
            <span className="step-number">2</span>What the release was built on
          </h3>
          <ul className="commitment-status">
            {decision.contract.rules.map((rule) => {
              const stated =
                !rule.quote || !hasText ? null : containsQuote(decision.currentText!, rule.quote);
              const replacement = stated === false ? likelyReplacement(rule.quote!, changes) : null;
              return (
                <li key={rule.id} className={stated === false ? 'lost' : ''}>
                  <div>
                    <strong>{ruleLabel(rule)}</strong>
                    <Tag tone={stated === false ? 'critical' : stated ? 'success' : 'neutral'}>
                      {stated === false ? 'Source changed' : stated ? 'Still stated' : 'Unverified'}
                    </Tag>
                  </div>
                  <p>{rule.summary}</p>
                  {rule.quote && (
                    <blockquote>
                      <Quote size={12} aria-hidden="true" /> {rule.quote}
                    </blockquote>
                  )}
                  {replacement && (
                    <p className="replacement">
                      <ArrowRight size={13} /> Now reads: “{replacement}”
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="review-step">
          <h3>
            <span className="step-number">3</span>Re-confirm for v{decision.currentVersion}
          </h3>
          {!draft ? (
            <div className="draft-start">
              <p>
                Accord proposes commitments, each quoting the page word for word. Nothing is saved
                until you confirm.
              </p>
              <button
                className="button secondary"
                onClick={runDraft}
                disabled={Boolean(busy) || !decision.accessible}
              >
                <Sparkles size={15} />
                {busy === 'draft' ? 'Reading the page…' : 'Draft commitments'}
              </button>
            </div>
          ) : (
            <div className="draft-list">
              <p className="fineprint">
                {draft.draft.accepted.length} grounded proposal
                {draft.draft.accepted.length === 1 ? '' : 's'}
                {draft.draft.rejected.length
                  ? ` · ${draft.draft.rejected.length} discarded`
                  : ''} · {draft.model}
              </p>
              {draft.draft.accepted.map((rule: Rule) => (
                <label key={rule.id} className="draft-item">
                  <input
                    type="checkbox"
                    checked={chosen.has(rule.id)}
                    onChange={(e) =>
                      setChosen((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(rule.id);
                        else next.delete(rule.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>
                      {ruleLabel(rule)}
                      {rule.kind === 'requires_done' ? ` · ${rule.issueKey}` : ''}
                      {rule.kind === 'forbids_label' ? ` · ${rule.label}` : ''}
                    </strong>
                    <span>{rule.summary}</span>
                    <blockquote>
                      <Quote size={12} aria-hidden="true" /> {rule.quote}
                    </blockquote>
                  </span>
                </label>
              ))}
              {draft.draft.rejected.length > 0 && (
                <details className="rejected">
                  <summary>
                    <CircleSlash size={13} /> Discarded proposals
                  </summary>
                  {draft.draft.rejected.map((item, index) => (
                    <p key={index}>
                      <strong>{item.summary}</strong> — {item.reason}
                    </p>
                  ))}
                </details>
              )}
            </div>
          )}
        </section>

        <SourceLink url={decision.url} demo={snapshot.mode === 'demo'}>
          Inspect the full source page
        </SourceLink>
        {draft && (
          <label className="confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I read the changes. Confirm these {ruleCount} commitment{ruleCount === 1 ? '' : 's'}{' '}
              for v{decision.currentVersion} and adopt it as this release’s reviewed baseline. Work
              that is already Done is not re-checked by this step.
            </span>
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <span>
            {snapshot.mode === 'demo'
              ? 'Local demo only'
              : 'Saves commitments on the Confluence page and updates the Jira review baseline'}
          </span>
          <button
            className="button primary"
            disabled={!draft || !confirmed || ruleCount === 0 || Boolean(busy)}
            onClick={adopt}
          >
            <Check size={16} />
            {busy === 'adopt' ? 'Confirming…' : `Confirm & adopt v${decision.currentVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
