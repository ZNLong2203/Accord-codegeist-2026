import { useEffect, useState } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import { createSampleRelease, isLive, listSampleTargets, type SampleTargets } from './client';
import { CommitmentDrafter } from './CommitmentDrafter';
import { Tag } from './ui';

/** Creates a labelled sample release in the caller's own site, after explicit consent. */
export function SampleReleaseCard({ onCreated }: { onCreated: (anchor: string) => void }) {
  const [targets, setTargets] = useState<SampleTargets | null>(null);
  const [project, setProject] = useState('');
  const [space, setSpace] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!isLive);
  const [result, setResult] = useState<{ anchorIssue: string; warnings: string[] } | null>(null);

  useEffect(() => {
    if (!isLive) return;
    listSampleTargets()
      .then((value) => {
        setTargets(value);
        setProject(value.projects[0]?.key ?? '');
        setSpace(value.spaces[0]?.key ?? '');
        setLoaded(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not list your projects.');
        setLoaded(true);
      });
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
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={!loaded}
              >
                {!loaded && <option>Loading projects…</option>}
                {targets?.projects.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.key})
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Confluence space</span>
              <select value={space} onChange={(e) => setSpace(e.target.value)} disabled={!loaded}>
                {!loaded && <option>Loading spaces…</option>}
                {targets?.spaces.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.key})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {targets && (!targets.projects.length || !targets.spaces.length) && (
            <p className="form-error" role="alert">
              {!targets.projects.length
                ? 'No Jira project is visible to you. Create one, then reload.'
                : 'No Confluence space is visible to Accord. Check that the app is installed in Confluence on this site and that you can view a space.'}
            </p>
          )}
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
  const [active, setActive] = useState('');
  const [saved, setSaved] = useState('');
  return (
    <section className="panel settings-card">
      <div className="section-top">
        <div>
          <h2>Add a decision page</h2>
          <p>
            Write decisions in plain language. Accord proposes the commitments; you confirm. You can
            also do this from the Accord button on any Confluence page.
          </p>
        </div>
        <Sparkles size={18} />
      </div>
      <div className="inline-form">
        <input
          className="text-input"
          placeholder="Confluence page ID, e.g. 327681"
          value={pageId}
          inputMode="numeric"
          onChange={(e) => {
            setPageId(e.target.value.replace(/\D/g, ''));
            setActive('');
          }}
        />
        <button
          className="button secondary"
          disabled={!pageId || pageId === active}
          onClick={() => {
            setActive(pageId);
            setSaved('');
          }}
        >
          Use this page
        </button>
      </div>
      {active && !saved && (
        <CommitmentDrafter
          key={active}
          pageId={active}
          onConfirmed={(version) => setSaved(`Saved on page ${active} for v${version}.`)}
        />
      )}
      {saved && (
        <p className="sample-done">
          <Check size={15} /> {saved} <Tag tone="success">Confirmed</Tag>
        </p>
      )}
    </section>
  );
}
