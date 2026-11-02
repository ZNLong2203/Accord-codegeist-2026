import { useState } from 'react';
import { Check, CircleSlash, Quote, Sparkles } from 'lucide-react';
import { ruleLabel } from '../domain/changes';
import type { Rule } from '../domain/schema';
import { draftCommitments, getSnapshot, isLive, type CommitmentDraft } from './client';

/**
 * Drafts commitments for one page, lets a human pick the grounded ones and
 * saves them on the page. Used on the Confluence byline and in Settings.
 */
export function CommitmentDrafter({
  pageId,
  label = 'Draft commitments',
  onConfirmed,
}: {
  pageId: string;
  label?: string;
  onConfirmed: (version: number) => void;
}) {
  const [draft, setDraft] = useState<CommitmentDraft | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'' | 'draft' | 'confirm'>('');
  const [error, setError] = useState('');

  async function run() {
    setBusy('draft');
    setError('');
    try {
      const result = await draftCommitments(await getSnapshot(''), pageId);
      setDraft(result);
      setChosen(new Set(result.draft.accepted.map((rule) => rule.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft commitments.');
    } finally {
      setBusy('');
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy('confirm');
    setError('');
    try {
      if (isLive) {
        const { invoke } = await import('@forge/bridge');
        await invoke('confirmCommitments', {
          pageId: draft.pageId,
          pageVersion: draft.pageVersion,
          title: draft.draft.title,
          owner: draft.draft.owner,
          appliesTo: draft.draft.appliesTo,
          rules: draft.draft.accepted.filter((rule: Rule) => chosen.has(rule.id)),
        });
      }
      onConfirmed(draft.pageVersion);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm the commitments.');
    } finally {
      setBusy('');
    }
  }

  if (!draft)
    return (
      <div className="drafter">
        <button className="button secondary" disabled={Boolean(busy)} onClick={run}>
          <Sparkles size={15} />
          {busy === 'draft' ? 'Reading the page…' : label}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );

  const governed = draft.draft.appliesTo;
  return (
    <div className="draft-list">
      <p className="fineprint">
        v{draft.pageVersion} · governs {governed.join(', ') || 'no work item written on the page'} ·{' '}
        {draft.model}
      </p>
      {draft.draft.accepted.map((rule) => (
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
            <CircleSlash size={13} /> {draft.draft.rejected.length} discarded proposal
            {draft.draft.rejected.length === 1 ? '' : 's'}
          </summary>
          {draft.draft.rejected.map((item, index) => (
            <p key={index}>
              <strong>{item.summary}</strong> — {item.reason}
            </p>
          ))}
        </details>
      )}
      {governed.length === 0 && (
        <p className="fineprint">
          Mention the Jira work item keys this decision governs on the page, then draft again.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="drafter-actions">
        <button className="text-button" onClick={() => setDraft(null)} disabled={Boolean(busy)}>
          Discard draft
        </button>
        <button
          className="button primary"
          disabled={Boolean(busy) || chosen.size === 0 || governed.length === 0}
          onClick={confirm}
        >
          <Check size={15} />
          {busy === 'confirm'
            ? 'Saving…'
            : `Confirm ${chosen.size} commitment${chosen.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
