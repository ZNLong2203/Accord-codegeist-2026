import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, ExternalLink, GitBranch, MessageCircle, Quote } from 'lucide-react';
import { ruleLabel } from '../domain/changes';
import type { PageStatus, RuleStatus } from '../domain/context';
import { getIssueContext, getPageStatus, isLive, type IssueContextResult } from './client';
import { CommitmentDrafter } from './CommitmentDrafter';
import { Logo, Tag } from './ui';

const AGENT = { type: 'forge' as const, agentKey: 'accord-reviewer', agentName: 'Accord' };

/** Opens Rovo chat with the Accord agent when the tenant has Rovo; hidden otherwise. */
function AskAccord({ prompt }: { prompt: string }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!isLive) return;
    import('@forge/bridge')
      .then(({ rovo }) => rovo.isEnabled())
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  return (
    <button
      className="button secondary compact"
      onClick={async () => {
        const { rovo } = await import('@forge/bridge');
        await rovo.open({ ...AGENT, prompt });
      }}
    >
      <MessageCircle size={14} /> Ask Accord in Rovo
    </button>
  );
}

function RuleLine({ status }: { status: RuleStatus }) {
  const { rule, state, replacement } = status;
  return (
    <li className={state === 'changed' ? 'lost' : ''}>
      <div>
        <strong>
          {ruleLabel(rule)}
          {rule.kind === 'requires_done' ? ` · ${rule.issueKey}` : ''}
        </strong>
        <Tag tone={state === 'changed' ? 'critical' : state === 'stated' ? 'success' : 'neutral'}>
          {state === 'changed'
            ? 'Source changed'
            : state === 'stated'
              ? 'Still stated'
              : 'Unverified'}
        </Tag>
      </div>
      {rule.quote ? (
        <blockquote>
          <Quote size={12} aria-hidden="true" /> {rule.quote}
        </blockquote>
      ) : (
        <p>{rule.summary}</p>
      )}
      {replacement && (
        <p className="replacement">
          <ArrowRight size={13} /> Now: “{replacement}”
        </p>
      )}
    </li>
  );
}

function SurfaceHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="surface-header">
      <Logo small />
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    setError('');
    load()
      .then(setValue)
      .catch((e) => setError(e instanceof Error ? e.message : 'Accord could not load.'));
  }, [load]);
  useEffect(reload, [reload]);
  return { value, error, reload };
}

/** Confluence byline: what this decision commits the team to, and the work built on it. */
export function PageCommitments({ pageId }: { pageId: string }) {
  const load = useCallback(() => getPageStatus(pageId), [pageId]);
  const { value: status, error, reload } = useLoad<PageStatus>(load);
  if (error) return <SurfaceError message={error} />;
  if (!status) return <SurfaceLoading />;
  const current = status.confirmedVersion === status.currentVersion;
  const changed = status.rules.filter((item) => item.state === 'changed').length;
  return (
    <div className="surface">
      <SurfaceHeader
        title={status.title || 'Decision page'}
        subtitle={
          status.confirmedVersion === null
            ? 'No confirmed commitments yet'
            : current
              ? `Commitments confirmed for v${status.currentVersion}`
              : `Confirmed for v${status.confirmedVersion} · page is now v${status.currentVersion}`
        }
      />
      {status.atRisk.length > 0 && (
        <div className="surface-alert" role="status">
          <GitBranch size={16} />
          <span>
            <strong>{status.atRisk.join(', ')}</strong> {status.atRisk.length === 1 ? 'is' : 'are'}{' '}
            Done but {status.atRisk.length === 1 ? 'was' : 'were'} built on {changed} commitment
            {changed === 1 ? '' : 's'} this edit changed.
          </span>
        </div>
      )}
      {status.contract && (
        <section>
          <h2>What this decision commits to</h2>
          <ul className="commitment-status">
            {status.rules.map((item) => (
              <RuleLine key={item.rule.id} status={item} />
            ))}
          </ul>
        </section>
      )}
      {(status.governed.length > 0 || status.prerequisites.length > 0) && (
        <section>
          <h2>Work built on it</h2>
          <ul className="work-list">
            {[...status.governed, ...status.prerequisites].map((item) => (
              <li key={item.key}>
                <span className="work-key">{item.key}</span>
                <span className="work-summary">{item.summary}</span>
                <Tag tone={item.done ? 'success' : 'neutral'}>{item.status}</Tag>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!current && (
        <section>
          <h2>
            {status.confirmedVersion === null
              ? 'Turn this page into checkable commitments'
              : `Re-confirm for v${status.currentVersion}`}
          </h2>
          <p className="fineprint">
            Each proposal must quote this page word for word. Nothing is saved until you confirm.
            Release reviews adopt the new version from Accord in Jira.
          </p>
          <CommitmentDrafter
            pageId={status.pageId}
            label={`Draft commitments for v${status.currentVersion}`}
            onConfirmed={reload}
          />
        </section>
      )}
      <footer className="surface-footer">
        <AskAccord
          prompt={`What does Confluence page ${status.pageId} ("${status.title}") commit us to? Use draft-commitments and quote the page.`}
        />
      </footer>
    </div>
  );
}

/** Jira issue context: the decisions this work item was built against. */
export function IssueDecisions({ issueKey }: { issueKey: string }) {
  const load = useCallback(() => getIssueContext(issueKey), [issueKey]);
  const { value, error } = useLoad<IssueContextResult>(load);
  if (error) return <SurfaceError message={error} />;
  if (!value) return <SurfaceLoading />;
  if (!value.reviews.length)
    return (
      <div className="surface surface-empty">
        <BookOpen size={18} />
        <p>
          {value.reason === 'no-release'
            ? 'This work item is not in a release yet. Accord links decisions to release work.'
            : 'No Accord release review includes this work item.'}
        </p>
      </div>
    );
  return (
    <div className="surface compact-surface">
      {value.reviews.map((review) => (
        <div key={review.anchorIssue} className="surface-review">
          <p className="surface-kicker">
            {review.release} · review {review.anchorIssue}
            {review.inScope ? '' : ' · prerequisite'}
          </p>
          {review.findings.map((finding) => (
            <article key={finding.id} className={`surface-finding ${finding.severity}`}>
              <div>
                <Tag tone={finding.severity}>
                  {finding.severity === 'critical'
                    ? 'Critical'
                    : finding.severity === 'unknown'
                      ? 'Unknown'
                      : 'Review'}
                </Tag>
              </div>
              <h2>{finding.title}</h2>
              <p>{finding.explanation}</p>
            </article>
          ))}
          {review.decisions.map((decision) => (
            <section key={decision.title}>
              <h2 className="decision-heading">
                {decision.url ? (
                  <a href={decision.url} target="_blank" rel="noreferrer">
                    {decision.title} <ExternalLink size={12} />
                  </a>
                ) : (
                  decision.title
                )}
                <small>
                  v{decision.reviewedVersion}
                  {decision.currentVersion !== decision.reviewedVersion
                    ? ` → v${decision.currentVersion}`
                    : ''}
                </small>
              </h2>
              <ul className="commitment-status">
                {decision.rules.map((item) => (
                  <RuleLine key={item.rule.id} status={item} />
                ))}
              </ul>
            </section>
          ))}
          <div className="surface-footer">
            {isLive && (
              <button
                className="button primary compact"
                onClick={async () => {
                  localStorage.setItem('accord.anchor', review.anchorIssue);
                  const { router } = await import('@forge/bridge');
                  await router.navigate({ target: 'module', moduleKey: 'accord-review' });
                }}
              >
                Open release review
              </button>
            )}
            <AskAccord
              prompt={`Is ${issueKey} still consistent with the decisions it was built on? The release review issue is ${review.anchorIssue}. Use inspect-release.`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SurfaceLoading() {
  return (
    <div className="surface surface-empty" aria-busy="true">
      <p>Reading the decisions behind this work…</p>
    </div>
  );
}

function SurfaceError({ message }: { message: string }) {
  return (
    <div className="surface surface-empty" role="alert">
      <p>{message}</p>
    </div>
  );
}
