import { useEffect, useState } from 'react';
import { Check, Quote, Sparkles, Wand2 } from 'lucide-react';
import type { Rule } from '../domain/schema';
import { ruleLabel } from '../domain/changes';
import {
  createSampleRelease,
  isLive,
  listSampleTargets,
  type CommitmentDraft,
  type SampleTargets,
} from './client';
import { Tag } from './ui';

/** Creates a labelled sample release in the caller's own site, after explicit consent. */
export function SampleReleaseCard({ onCreated }: { onCreated: (anchor: string) => void }) {
  const [targets, setTargets] = useState<SampleTargets | null>(null);
  const [project, setProject] = useState('');
  const [space, setSpace] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ anchorIssue: string; warnings: string[] } | null>(null);

  useEffect(() => {
    if (!isLive) return;
    listSampleTargets()
      .then((value) => {
        setTargets(value);
        setProject(value.projects[0]?.key ?? '');
        setSpace(value.spaces[0]?.key ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not list your projects.'));
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const created = await createSampleRelease(project, space);
      setResult(created);
      localStorage.setItem('accord.anchor', created.anchorIssue);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The sample release could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card sample-card">
      <div className="section-top">
        <div>
          <h2>See it on your own site</h2>
          <p>One click creates a small sample release you can inspect, change and delete.</p>
        </div>
        <Wand2 size={18} />
      </div>
      <ul className="sample-list">
        <li>A release version and five work items labelled accord-sample</li>
        <li>Two decision pages written in plain prose, with confirmed commitments</li>
        <li>One decision edit after review, so there is real drift to find</li>
      </ul>
      {!isLive ? (
        <p className="fineprint">
          Available in the Forge app. This local demo already contains the same story.
        </p>
      ) : result ? (
        <div className="sample-done">
          <p>
            <Check size={15} /> Created. The review lives on <strong>{result.anchorIssue}</strong>.
          </p>
          {result.warnings.map((warning) => (
            <p key={warning} className="fineprint">
              {warning}
            </p>
          ))}
          <button className="button primary" onClick={() => onCreated(result.anchorIssue)}>
            Open the review
          </button>
        </div>
      ) : (
        <>
          <div className="sample-targets">
            <label className="form-field">
              <span>Jira project</span>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                {targets?.projects.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.key})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Confluence space</span>
              <select value={space} onChange={(e) => setSpace(e.target.value)}>
                {targets?.spaces.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.key})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="confirmation">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Create these sample items as me in {project || 'the selected project'} and{' '}
              {space || 'the selected space'}. I can administer the project and create pages there.
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={!consent || busy || !project || !space}
            onClick={create}
          >
            <Sparkles size={15} />
            {busy ? 'Creating the sample release…' : 'Create sample release'}
          </button>
        </>
      )}
    </section>
  );
}

/** Drafts and confirms commitments for a decision page that is not in a review yet. */
export function ConfirmPageCard() {
  const [pageId, setPageId] = useState('');
  const [draft, setDraft] = useState<CommitmentDraft | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const { invoke } = await import('@forge/bridge');
      const result = (await invoke('draftCommitments', { pageId: pageId.trim() })) as any;
      const value: CommitmentDraft = result?.body ?? result;
      setDraft(value);
      setChosen(new Set(value.draft.accepted.map((rule) => rule.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft commitments.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const { invoke } = await import('@forge/bridge');
      await invoke('confirmCommitments', {
        pageId: draft.pageId,
        pageVersion: draft.pageVersion,
        title: draft.draft.title,
        owner: draft.draft.owner,
        appliesTo: draft.draft.appliesTo,
        rules: draft.draft.accepted.filter((rule: Rule) => chosen.has(rule.id)),
      });
      setSaved(`Saved on page ${draft.pageId} for v${draft.pageVersion}.`);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm the commitments.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card">
      <div className="section-top">
        <div>
          <h2>Add a decision page</h2>
          <p>Write decisions in plain language. Accord proposes the commitments; you confirm.</p>
        </div>
        <Sparkles size={18} />
      </div>
      <div className="inline-form">
        <input
          className="text-input"
          placeholder="Confluence page ID, e.g. 327681"
          value={pageId}
          inputMode="numeric"
          onChange={(e) => setPageId(e.target.value.replace(/\D/g, ''))}
        />
        <button className="button secondary" disabled={!pageId || busy} onClick={run}>
          {busy && !draft ? 'Reading…' : 'Draft commitments'}
        </button>
      </div>
      {draft && (
        <div className="draft-list">
          <p className="fineprint">
            {draft.pageTitle} · v{draft.pageVersion} · applies to{' '}
            {draft.draft.appliesTo.join(', ') || 'no work item written on the page'}
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
                <strong>{ruleLabel(rule)}</strong>
                <span>{rule.summary}</span>
                <blockquote>
                  <Quote size={12} aria-hidden="true" /> {rule.quote}
                </blockquote>
              </span>
            </label>
          ))}
          {draft.draft.rejected.length > 0 && (
            <p className="fineprint">
              {draft.draft.rejected.length} ungrounded proposal(s) discarded.
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || chosen.size === 0 || draft.draft.appliesTo.length === 0}
            onClick={confirm}
          >
            <Check size={15} /> Confirm {chosen.size} commitment{chosen.size === 1 ? '' : 's'}
          </button>
          {draft.draft.appliesTo.length === 0 && (
            <p className="fineprint">
              Mention the Jira work item keys this decision governs on the page, then draft again.
            </p>
          )}
        </div>
      )}
      {saved && (
        <p className="sample-done">
          <Check size={15} /> {saved} <Tag tone="success">Confirmed</Tag>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
