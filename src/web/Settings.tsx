import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { configurationSchema, type Contract, type Snapshot } from '../domain/schema';
import { isLive, saveConfiguration } from './client';
import { SourceIcon, Tag } from './ui';
import { ContractBuilder } from './ContractBuilder';
export function Settings({
  snapshot,
  anchor,
  setAnchor,
  onLoaded,
  onDemo,
  onReset,
  onAddDecision,
}: {
  snapshot: Snapshot | null;
  anchor: string;
  setAnchor: (value: string) => void;
  onLoaded: () => void;
  onDemo: (kind: 'page' | 'tests' | 'owner') => void;
  onReset: () => void;
  onAddDecision?: (contract: Contract) => void;
}) {
  const [configuration, setConfiguration] = useState({
    project: '',
    version: '',
    anchorIssue: anchor,
    targetDate: '',
    pageIds: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adopt, setAdopt] = useState(false);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const parsed = configurationSchema.parse({
        ...configuration,
        pageIds: configuration.pageIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      });
      await saveConfiguration(parsed);
      localStorage.setItem('accord.anchor', parsed.anchorIssue);
      setAnchor(parsed.anchorIssue);
      // Loading is driven by the chosen anchor after state is applied.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect the release.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <ContractBuilder snapshot={snapshot} onAdd={onAddDecision} />
      <section className="panel settings-card">
        <div className="section-top">
          <div>
            <h2>Connected context</h2>
            <p>
              {isLive
                ? 'Read as the current Atlassian user.'
                : 'Fictional data, designed to be explored.'}
            </p>
          </div>
          <Tag tone={isLive ? 'success' : 'neutral'}>{isLive ? 'Forge' : 'Demo'}</Tag>
        </div>
        <div className="connection-row">
          <SourceIcon type="jira" />
          <div>
            <strong>Jira</strong>
            <small>{snapshot?.release.name ?? 'No release configured'}</small>
          </div>
          <Tag tone={snapshot ? 'success' : 'neutral'}>
            {snapshot ? 'Connected' : 'Setup needed'}
          </Tag>
        </div>
        <div className="connection-row">
          <SourceIcon type="confluence" />
          <div>
            <strong>Confluence</strong>
            <small>{snapshot?.decisions.length ?? 0} selected decision pages</small>
          </div>
          <Tag tone={snapshot ? 'success' : 'neutral'}>
            {snapshot ? 'Connected' : 'Setup needed'}
          </Tag>
        </div>
        <div className="connection-row">
          <Sparkles size={20} />
          <div>
            <strong>Rovo agent & MCP tools</strong>
            <small>
              {isLive
                ? 'Defined in the Forge manifest · verify in your tenant'
                : 'Available after Forge deployment · not running in this demo'}
            </small>
          </div>
          <Tag>Forge only</Tag>
        </div>
        <div className="inline-info">
          <ShieldCheck size={18} />
          <span>
            Local mode needs no credentials. Live mode uses Forge managed authentication and your
            existing Jira and Confluence permissions.
          </span>
        </div>
      </section>
      {!isLive ? (
        <section className="panel settings-card">
          <div className="section-top">
            <div>
              <h2>Change the demo evidence</h2>
              <p>See how observed changes affect the rules.</p>
            </div>
            <FlaskConical size={18} />
          </div>
          <div className="demo-control">
            <div>
              <strong>Decision page version</strong>
              <p>Publish a new fictional version while keeping the reviewed baseline.</p>
            </div>
            <button className="button secondary compact" onClick={() => onDemo('page')}>
              Publish page edit
            </button>
          </div>
          <div className="demo-control">
            <div>
              <strong>Prerequisite status</strong>
              <p>Mark PLAT-139 Done, or put it back in progress.</p>
            </div>
            <button className="button secondary compact" onClick={() => onDemo('tests')}>
              Toggle test status
            </button>
          </div>
          <div className="demo-control">
            <div>
              <strong>Rollout ownership</strong>
              <p>Assign Jonah to PLAT-148, or remove the assignment.</p>
            </div>
            <button className="button secondary compact" onClick={() => onDemo('owner')}>
              Toggle owner
            </button>
          </div>
          <div className="settings-reset">
            <p>Start again with the original three signals.</p>
            <button className="text-button" onClick={onReset}>
              <RefreshCw size={14} />
              Reset demo & history
            </button>
          </div>
        </section>
      ) : (
        <section className="panel settings-card">
          <div className="section-top">
            <div>
              <h2>Open an existing review</h2>
              <p>The configured Jira issue carries the shared baseline.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="anchor">
            Release review issue
          </label>
          <input
            id="anchor"
            className="text-input"
            placeholder="PLAT-150"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value.toUpperCase())}
          />
          <button
            className="button primary"
            onClick={() => {
              localStorage.setItem('accord.anchor', anchor);
              onLoaded();
            }}
          >
            Load review
            <ArrowRight size={15} />
          </button>
        </section>
      )}
      {isLive && (
        <form className="panel settings-card setup-form" onSubmit={connect}>
          <div className="section-top">
            <div>
              <h2>Adopt a reviewed baseline</h2>
              <p>Requires Jira edit permission and access to every selected Confluence page.</p>
            </div>
          </div>
          {(
            [
              { key: 'project', label: 'Jira project key', placeholder: 'PLAT' },
              { key: 'version', label: 'Fix version name', placeholder: '2.8' },
              { key: 'anchorIssue', label: 'Release review issue', placeholder: 'PLAT-150' },
              { key: 'targetDate', label: 'Target date', placeholder: '2026-11-06' },
              {
                key: 'pageIds',
                label: 'Confluence page IDs, comma-separated',
                placeholder: '1001,1002,1003',
              },
            ] as const
          ).map((field) => (
            <label className="form-field" key={field.key}>
              <span>{field.label}</span>
              <input
                required
                type={field.key === 'targetDate' ? 'date' : 'text'}
                placeholder={field.placeholder}
                value={configuration[field.key]}
                onChange={(e) =>
                  setConfiguration((previous) => ({ ...previous, [field.key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="confirmation">
            <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} />
            <span>
              I inspected the current page versions and their Accord JSON blocks. Save these
              versions and explicit commitments as the release baseline. This replaces any existing
              baseline on this issue.
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" disabled={!adopt || busy}>
            {busy ? 'Connecting…' : 'Save reviewed baseline'}
          </button>
        </form>
      )}
      {!isLive && (
        <section className="panel settings-card setup-form">
          <div className="section-top">
            <div>
              <h2>Ready for your own team?</h2>
              <p>The same evaluator runs inside Forge.</p>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <ol className="setup-steps">
            <li>
              <span>01</span>Create an Atlassian developer site with Jira and Confluence.
            </li>
            <li>
              <span>02</span>Register, build and deploy the Forge app using the repository guide.
            </li>
            <li>
              <span>03</span>Add an Accord JSON contract to each selected decision page.
            </li>
            <li>
              <span>04</span>Adopt a reviewed baseline, then inspect your release in Accord.
            </li>
          </ol>
          <p className="fineprint">
            See docs/setup.md and docs/contracts.md in the repository. Local demo success does not
            verify installation, Rovo, or MCP in Atlassian.
          </p>
        </section>
      )}
    </div>
  );
}
