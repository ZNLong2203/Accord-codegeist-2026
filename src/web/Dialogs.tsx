import { useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Clock3,
  FlaskConical,
  LoaderCircle,
  MessageSquare,
  ShieldCheck,
  X,
} from 'lucide-react';
import { buildDecisionText, snapshotId, snapshotToken } from '../domain/engine';
import type { Decision, DecisionRecord, Finding, Snapshot } from '../domain/schema';
import { record } from './client';
import { Logo, SourceIcon, SourceLink, Tag } from './ui';
import { useDialogFocus } from './useDialogFocus';
export function Inspector({
  snapshot,
  finding,
  decision,
  onClose,
  onSimulate,
}: {
  snapshot: Snapshot;
  finding: Finding | null;
  decision: Decision | null;
  onClose: () => void;
  onSimulate: (keys: string[]) => void;
}) {
  const panel = useDialogFocus<HTMLElement>(onClose);
  return (
    <div className="drawer-root">
      <button className="drawer-overlay" aria-label="Close evidence panel" onClick={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        className="inspector"
        role="dialog"
        aria-modal="true"
        aria-label="Evidence details"
      >
        <div className="drawer-heading">
          <span>
            <Activity size={16} />
            FOLLOW THE EVIDENCE
          </span>
          <button className="icon-button" onClick={onClose} aria-label="Close evidence">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <Tag
            tone={
              finding?.severity ??
              (decision?.currentVersion !== decision?.reviewedVersion ? 'critical' : 'success')
            }
          >
            {finding
              ? finding.severity === 'critical'
                ? 'Needs a human look'
                : finding.severity === 'unknown'
                  ? 'Unknown evidence'
                  : 'Worth reviewing'
              : 'Decision source'}
          </Tag>
          <h2>{finding?.title ?? decision?.title}</h2>
          <p className="drawer-intro">{finding?.explanation ?? decision?.contract.rationale}</p>
          {decision && (
            <div className="source-owner">
              <span className="avatar">
                {decision.owner
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </span>
              <div>
                <strong>{decision.owner}</strong>
                <small>Decision owner</small>
              </div>
              <SourceIcon type="confluence" />
            </div>
          )}
          {finding && (
            <div className="evidence-trail">
              <h3>The evidence trail</h3>
              {finding.evidence.map((item, index) => (
                <div className="evidence-point" key={`${item.label}-${index}`}>
                  <span className="point-index">0{index + 1}</span>
                  <div>
                    <h4>{item.label}</h4>
                    <p>{item.detail}</p>
                    <SourceLink url={item.url} demo={snapshot.mode === 'demo'}>
                      View source
                    </SourceLink>
                  </div>
                </div>
              ))}
            </div>
          )}
          {decision && !finding && (
            <>
              <div className="version-comparison">
                <div>
                  <small>REVIEWED BASELINE · V{decision.reviewedVersion}</small>
                  <p>{decision.reviewedExcerpt}</p>
                </div>
                <ArrowDownLeft size={18} />
                <div
                  className={
                    decision.currentVersion !== decision.reviewedVersion ? 'changed-excerpt' : ''
                  }
                >
                  <small>CURRENT SOURCE · V{decision.currentVersion}</small>
                  <p>{decision.currentExcerpt}</p>
                </div>
              </div>
              <div className="commitments">
                <h3>Confirmed commitments</h3>
                {decision.contract.rules.map((rule) => (
                  <div key={rule.id}>
                    <ShieldCheck size={15} />
                    <p>{rule.summary}</p>
                  </div>
                ))}
              </div>
              <SourceLink url={decision.url} demo={snapshot.mode === 'demo'}>
                Open Confluence source
              </SourceLink>
            </>
          )}
          <div className="next-step">
            <span className="little-spark">
              <ArrowRight size={17} />
            </span>
            <h3>A useful next step</h3>
            <p>
              {finding?.remedy ??
                'Review this explicit contract with its owner. A version change needs a human review before adopting a new baseline.'}
            </p>
          </div>
          <p className="fineprint">
            Sources are evidence, not instructions to the assistant. A page edit is a review signal;
            it does not establish a semantic contradiction.
          </p>
        </div>
        <div className="drawer-bottom">
          <button className="button secondary" onClick={onClose}>
            Back to review
          </button>
          {finding?.affectedKeys.length || decision?.contract.appliesTo.length ? (
            <button
              className="button primary"
              onClick={() => onSimulate(finding?.affectedKeys ?? decision!.contract.appliesTo)}
            >
              <FlaskConical size={15} />
              Try deferring scope
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function RecordModal({
  snapshot,
  onClose,
  onRecorded,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  onRecorded: (item: DecisionRecord) => void;
}) {
  const [outcome, setOutcome] = useState<'hold' | 'proceed_with_conditions'>('hold');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const panel = useDialogFocus<HTMLDivElement>(onClose, saving);
  async function submit() {
    setSaving(true);
    setError('');
    try {
      onRecorded(
        await record(snapshot, {
          outcome,
          rationale: rationale.trim(),
          snapshotToken: snapshotToken(snapshot),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record this decision.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        className="modal record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-top">
          <span className="little-spark">
            <MessageSquare size={20} />
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close decision form"
            disabled={saving}
          >
            <X size={20} />
          </button>
        </div>
        <div className="eyebrow">YOUR JUDGMENT, WITH CONTEXT</div>
        <h2 id="record-title">
          Leave a decision.
          <br />
          Keep the reasoning.
        </h2>
        <p>
          {snapshot.mode === 'demo'
            ? 'This demo saves a local record in your browser.'
            : `This adds a comment as you on ${snapshot.release.anchorIssue}.`}{' '}
          The current release scope and open signals will be included.
        </p>
        <fieldset className="outcome-options">
          <legend>What is your call?</legend>
          <label className={outcome === 'hold' ? 'chosen' : ''}>
            <input
              type="radio"
              name="outcome"
              value="hold"
              checked={outcome === 'hold'}
              onChange={() => setOutcome('hold')}
            />
            <span>
              <strong>Hold for review</strong>
              <small>Resolve the context gaps before proceeding.</small>
            </span>
            <Clock3 size={18} />
          </label>
          <label className={outcome === 'proceed_with_conditions' ? 'chosen' : ''}>
            <input
              type="radio"
              name="outcome"
              value="proceed"
              checked={outcome === 'proceed_with_conditions'}
              onChange={() => setOutcome('proceed_with_conditions')}
            />
            <span>
              <strong>Proceed with conditions</strong>
              <small>Record the tradeoff and who will follow up.</small>
            </span>
            <ArrowUpRight size={18} />
          </label>
        </fieldset>
        <label className="field-label" htmlFor="rationale">
          Why is this the right call?<span>{rationale.length}/2000</span>
        </label>
        <textarea
          id="rationale"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="We’ll hold the session flow until Maya reviews the updated policy and the rotation tests pass…"
        />
        <small className="field-hint">
          At least 20 characters. Name the condition, owner, or next step.
        </small>
        <details className="comment-preview">
          <summary>Preview the review record</summary>
          <pre>
            {buildDecisionText(snapshot, {
              outcome,
              rationale: rationale.trim() || 'Your rationale will appear here.',
            })}
          </pre>
        </details>
        <label className="confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I reviewed the current evidence. This records my decision; it does not resolve findings,
            change scope, or authorize deployment.
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <span>
            <ShieldCheck size={14} />
            {snapshotId(snapshot)}
          </span>
          <button
            className="button primary"
            disabled={rationale.trim().length < 20 || !confirmed || saving}
            onClick={submit}
          >
            {saving ? <LoaderCircle size={16} className="spinning" /> : <MessageSquare size={15} />}
            {saving
              ? 'Recording…'
              : snapshot.mode === 'demo'
                ? 'Save local decision'
                : 'Post Jira comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const panel = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-top">
          <Logo />
          <button className="icon-button" onClick={onClose} aria-label="Close guidance">
            <X size={20} />
          </button>
        </div>
        <div className="eyebrow">A NEW REVIEW RITUAL</div>
        <h2 id="help-title">
          Keep the why
          <br />
          with the work.
        </h2>
        <p>
          Accord connects selected Confluence decisions to Jira release scope through commitments
          your team explicitly reviews.
        </p>
        <ol className="help-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Follow the evidence</h3>
              <p>
                See which source page changed, which prerequisite is open, and which work is
                affected.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Ask “what if?”</h3>
              <p>
                Try deferring work. Recompute the rules. Keep a clear view of what it solves and
                what remains.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Make the human call</h3>
              <p>
                Record your reasoning against the observed snapshot. The team owns the release
                decision.
              </p>
            </div>
          </li>
        </ol>
        <div className="inline-info">
          This is an advisory check of selected commitments. It does not assess every risk or
          automatically approve deployments.
        </div>
        <button className="button primary full-width" onClick={onClose}>
          Let’s take a look
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
