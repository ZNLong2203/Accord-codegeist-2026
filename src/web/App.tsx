import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FlaskConical,
  GitBranch,
  History,
  Layers3,
  Menu,
  MessageSquare,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { assess, findSmallestSafeScope, snapshotId } from '../domain/engine';
import { createDemoSnapshot } from '../domain/demo';
import type { Contract, Decision, Snapshot } from '../domain/schema';
import { getSnapshot, isLive, resetDemo, saveDemo } from './client';
import { Logo, SourceIcon, Tag, time } from './ui';
import { EvidenceMap, FindingRow } from './ReviewGraph';
import { Inspector, RecordModal, HelpModal } from './Dialogs';
import { Settings } from './Settings';
import { HistoryPanel } from './HistoryPanel';
import { SourceReview } from './SourceReview';

type Page = 'review' | 'decisions' | 'scenario' | 'history' | 'settings';
const pages = [
  { id: 'review', label: 'Review room', icon: Layers3 },
  { id: 'decisions', label: 'Decision library', icon: BookOpen },
  { id: 'scenario', label: 'What-if lab', icon: FlaskConical },
  { id: 'history', label: 'Review history', icon: History },
] as const;

export function App() {
  const [page, setPage] = useState<Page>('review');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(isLive ? null : createDemoSnapshot());
  const [anchor, setAnchor] = useState(() => localStorage.getItem('accord.anchor') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [sourceReview, setSourceReview] = useState<{
    snapshot: Snapshot;
    decision: Decision;
  } | null>(null);
  const [modal, setModal] = useState(false);
  const [help, setHelp] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const refreshSequence = useRef(0);

  async function refresh() {
    const ticket = ++refreshSequence.current;
    setBusy(true);
    setError('');
    try {
      const next = await getSnapshot(anchor);
      if (ticket !== refreshSequence.current) return false;
      setSnapshot(next);
      return true;
    } catch (e) {
      if (ticket === refreshSequence.current)
        setError(e instanceof Error ? e.message : 'Could not load release evidence.');
      return false;
    } finally {
      if (ticket === refreshSequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!isLive || anchor) void refresh();
    else setPage('settings');
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'k' &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const baseline = useMemo(() => (snapshot ? assess(snapshot) : null), [snapshot]);
  const assessment = useMemo(
    () => (snapshot ? assess(snapshot, excluded) : null),
    [snapshot, excluded],
  );
  const selectedFinding =
    assessment?.findings.find((finding) => finding.id === selected) ??
    baseline?.findings.find((finding) => finding.id === selected) ??
    null;
  const selectedDecision =
    snapshot?.decisions.find(
      (decision) => decision.id === selected || decision.id === selectedFinding?.decisionId,
    ) ?? null;
  const critical =
    assessment?.findings.filter((finding) => finding.severity === 'critical').length ?? 0;
  const unknown = assessment?.findings.some((finding) => finding.severity === 'unknown');
  const done = assessment?.scope.filter((issue) => issue.statusCategory === 'done').length ?? 0;
  const scopeCount = snapshot?.issues.filter((issue) => issue.inScope).length ?? 0;
  const filteredFindings =
    assessment?.findings.filter((finding) =>
      `${finding.title} ${finding.explanation} ${finding.affectedKeys.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];

  function navigate(next: Page) {
    setPage(next);
    setQuery('');
    setSelected(null);
    setSidebar(false);
  }
  function toggleExclude(key: string) {
    setExcluded((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    );
  }
  function updateDemo(kind: 'page' | 'tests' | 'owner') {
    if (!snapshot) return;
    const next = structuredClone(snapshot);
    if (kind === 'page') {
      const decision = next.decisions[0];
      decision.currentVersion += 1;
      decision.currentExcerpt = `Rotate refresh tokens on every use. Review the rollback window for source version ${decision.currentVersion}.`;
      decision.currentContract = {
        ...(decision.currentContract ?? decision.contract),
        rationale: decision.currentExcerpt,
      };
      decision.updated = new Date().toISOString();
    } else if (kind === 'tests') {
      const issue = next.issues.find((issue) => issue.key === 'PLAT-139')!;
      issue.statusCategory = issue.statusCategory === 'done' ? 'indeterminate' : 'done';
      issue.status = issue.statusCategory === 'done' ? 'Done' : 'In progress';
      issue.updated = new Date().toISOString();
    } else {
      const issue = next.issues.find((issue) => issue.key === 'PLAT-148')!;
      issue.assignee = issue.assignee ? null : 'Jonah Rivera';
      issue.updated = new Date().toISOString();
    }
    next.capturedAt = new Date().toISOString();
    saveDemo(next);
    setSnapshot(next);
    setToast('Demo evidence updated. All rules have been re-evaluated.');
  }

  function addDemoDecision(contract: Contract) {
    if (!snapshot || isLive) return;
    if (snapshot.decisions.length >= 10) {
      setToast('This review supports up to 10 decision pages.');
      return;
    }
    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const decision: Decision = {
      id: `demo-${id}`,
      pageId: id,
      title: contract.title,
      url: '',
      owner: contract.owner,
      reviewedVersion: 1,
      currentVersion: 1,
      reviewedExcerpt: contract.rationale,
      currentExcerpt: contract.rationale,
      currentAppliesTo: contract.appliesTo,
      currentContract: structuredClone(contract),
      contract,
      updated: new Date().toISOString(),
      accessible: true,
    };
    const next = {
      ...snapshot,
      capturedAt: new Date().toISOString(),
      decisions: [...snapshot.decisions, decision],
    };
    saveDemo(next);
    setSnapshot(next);
    setToast('Decision added to the local demo library.');
  }

  function exportReview() {
    if (!snapshot) return;
    const content = `# ${snapshot.release.name} — Accord review\n\nSnapshot: ${snapshotId(snapshot)}\nMode: ${snapshot.mode}\nObserved: ${snapshot.capturedAt}\n\n${excluded.length ? `SIMULATION: deferred ${excluded.join(', ')}. No changes applied.\n\n` : ''}${assessment?.findings.map((finding) => `## ${finding.title}\n\n${finding.explanation}\n\n${finding.evidence.map((e) => `- ${e.label}: ${e.detail}`).join('\n')}\n\nNext step: ${finding.remedy}`).join('\n\n') || 'No open signals for the checked commitments. This is not deployment approval.'}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `accord-${snapshot.release.project.toLowerCase()}-review.md`;
    link.click();
    URL.revokeObjectURL(url);
    setToast('Review exported as Markdown.');
  }

  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-scrim"
          onClick={() => setSidebar(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('review')} aria-label="Accord home">
          <Logo />
          <span>
            accord<span className="brand-dot">.</span>
          </span>
        </button>
        <button className="workspace-switch" onClick={() => navigate('settings')}>
          <span className="workspace-avatar">
            <Layers3 size={16} />
          </span>
          <span>
            Platform team<small>Engineering workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {pages.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === 'review' && (
                <span className="nav-count">{baseline?.findings.length ?? '—'}</span>
              )}
              {item.id === 'scenario' && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="little-spark">
            <Sparkles size={17} />
          </span>
          <h3>Context is a team sport.</h3>
          <p>Connect the decisions behind the work. Catch what changed.</p>
          <button onClick={() => setHelp(true)}>
            Meet your new review ritual <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            Settings & connections
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />A little guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="user">
            <span className="avatar">{isLive ? 'YOU' : 'AM'}</span>
            <span>
              {isLive ? 'Current Jira user' : 'Alex Morgan'}
              <small>{isLive ? 'Atlassian workspace' : 'Demo workspace'}</small>
            </span>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              onClick={() => setSidebar(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{pages.find((item) => item.id === page)?.label ?? 'Settings'}</strong>
          </div>
          <div className="top-actions">
            <div className="search">
              <Search size={15} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find in this review…"
                aria-label="Search review"
              />
              <kbd>⌘ K</kbd>
            </div>
            <button className="icon-button" aria-label="Help" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
            </button>
            <span className="avatar tiny">{isLive ? 'YOU' : 'AM'}</span>
          </div>
        </header>
        <main>
          <div className="mode-banner">
            <span>
              <span className={`status-dot ${isLive ? 'green' : ''}`} />
              {isLive ? 'Connected Forge app' : 'Interactive demo'}
              <span className="banner-separator">/</span>
              {isLive
                ? 'Evidence is read with your Atlassian permissions.'
                : 'Fictional team. Real rules. No Atlassian account needed.'}
            </span>
            <button onClick={() => navigate('settings')}>
              {isLive ? 'Connections' : 'Explore demo controls'}
              <ArrowUpRight size={13} />
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button onClick={refresh}>Retry</button>
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                {page === 'review'
                  ? 'A CLEARER PICTURE, BEFORE YOU SHIP'
                  : page === 'scenario'
                    ? 'EXPLORE A DIFFERENT PATH'
                    : page === 'decisions'
                      ? 'THE WHY BEHIND THE WORK'
                      : page === 'history'
                        ? 'DECISIONS WITH A PAPER TRAIL'
                        : 'MAKE THE CONTEXT YOURS'}
              </div>
              <h1>
                {page === 'review'
                  ? 'Release review'
                  : page === 'scenario'
                    ? 'What if we changed the scope?'
                    : page === 'decisions'
                      ? 'Decision library'
                      : page === 'history'
                        ? 'Review history'
                        : 'Settings & connections'}
                {page !== 'scenario' && <span className="heading-dot">.</span>}
              </h1>
              <p>
                {page === 'review'
                  ? 'The work tells one story. Make sure the decisions tell the same one.'
                  : page === 'scenario'
                    ? 'Try a smaller release. See exactly which signals change. Nothing gets applied.'
                    : page === 'decisions'
                      ? 'Explicit commitments, source versions, and the work they inform.'
                      : page === 'history'
                        ? 'Human judgment, recorded alongside the evidence available at the time.'
                        : 'Connect your release, or change the fictional evidence to explore the demo.'}
              </p>
            </div>
            <div className="heading-actions">
              {snapshot && (
                <button className="button secondary compact" onClick={refresh} disabled={busy}>
                  <RefreshCw size={15} className={busy ? 'spinning' : ''} />
                  Refresh
                </button>
              )}
              {snapshot && page === 'review' && (
                <button
                  className="button primary"
                  onClick={() => setModal(true)}
                  disabled={!!unknown || excluded.length > 0 || !!error || busy}
                >
                  <MessageSquare size={15} />
                  Record decision
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </div>

          {snapshot && assessment && baseline && (
            <>
              {page === 'review' && (
                <>
                  {excluded.length > 0 && (
                    <div className="scenario-banner">
                      <FlaskConical size={17} />
                      <span>
                        <strong>You’re viewing a simulation.</strong> {excluded.length} work item
                        {excluded.length > 1 ? 's' : ''} deferred. Jira is unchanged.
                      </span>
                      <button onClick={() => setExcluded([])}>
                        Back to current scope <X size={14} />
                      </button>
                    </div>
                  )}
                  <section className="overview-grid" aria-label="Release overview">
                    <div
                      className={`release-story ${assessment.verdict === 'clear' ? 'clear' : ''}`}
                    >
                      <div className="story-top">
                        <Tag tone="dark">
                          <span className="status-dot" />
                          {snapshot.release.name}
                        </Tag>
                        <span className="story-icon">
                          <GitBranch size={21} />
                        </span>
                      </div>
                      <h2>
                        {assessment.verdict === 'unknown' ? (
                          <>
                            There’s a gap
                            <br />
                            in the evidence.
                          </>
                        ) : assessment.verdict === 'clear' ? (
                          <>
                            The checked commitments
                            <br />
                            are in sync.
                          </>
                        ) : (
                          <>
                            The work moved forward.
                            <br />
                            Did the context?
                          </>
                        )}
                      </h2>
                      <p>
                        {assessment.verdict === 'unknown' ? (
                          'Restore the missing sources before making a call.'
                        ) : assessment.verdict === 'clear' ? (
                          'No open signals in the selected scope. Your team makes the final call.'
                        ) : critical ? (
                          <>
                            {critical} critical signal{critical === 1 ? '' : 's'}{' '}
                            {critical === 1 ? 'needs' : 'need'} a human look before this release.
                          </>
                        ) : (
                          <>The remaining signals need a human review.</>
                        )}
                      </p>
                      <div className="story-footer">
                        <span className="stacked-avatars">
                          {[
                            ...new Set(
                              snapshot.decisions.filter((d) => d.accessible).map((d) => d.owner),
                            ),
                          ]
                            .slice(0, 3)
                            .map((owner) => (
                              <i key={owner}>
                                {owner
                                  .split(' ')
                                  .map((part) => part[0])
                                  .slice(0, 2)
                                  .join('')}
                              </i>
                            ))}
                        </span>
                        <span>{snapshot.decisions.length} decision pages, one shared picture</span>
                        <ArrowDownLeft size={20} />
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">
                        Work in scope
                        <Layers3 size={16} />
                      </div>
                      <div className="metric-number">
                        {assessment.scope.length}
                        <span>work items</span>
                      </div>
                      <div className="work-progress">
                        {snapshot.issues
                          .filter((issue) => issue.inScope)
                          .map((issue) => (
                            <span
                              key={issue.key}
                              title={`${issue.key}: ${issue.status}`}
                              className={`${issue.statusCategory === 'done' ? 'done' : ''} ${excluded.includes(issue.key) ? 'excluded' : ''}`}
                            />
                          ))}
                      </div>
                      <p>
                        {done} of {assessment.scope.length} included items marked Done
                      </p>
                      <div className="metric-bottom">
                        <SourceIcon type="jira" />
                        Being done is only half the story.
                      </div>
                    </div>
                    <div className="metric-card context-metric">
                      <div className="metric-label">
                        Context to revisit
                        <Activity size={16} />
                      </div>
                      <div className="metric-number">
                        {assessment.findings.length.toString().padStart(2, '0')}
                        <span>open signals</span>
                      </div>
                      <div className="signal-counts">
                        <span>
                          <i className="signal-dot critical" />
                          {critical} critical
                        </span>
                        <span>
                          <i className="signal-dot warning" />
                          {assessment.findings.filter((f) => f.severity === 'warning').length} to
                          review
                        </span>
                        {unknown && <span>Unknown evidence</span>}
                      </div>
                      <div className="metric-bottom">
                        <Clock3 size={14} />
                        Observed {time(snapshot.capturedAt)}
                      </div>
                    </div>
                  </section>

                  <section className="panel context-panel">
                    <div className="section-top">
                      <div>
                        <h2>
                          The context behind this release{' '}
                          <span className="subtle-pill">{snapshot.decisions.length} decisions</span>
                        </h2>
                        <p>Follow a decision to the work it touches.</p>
                      </div>
                      <button className="text-button" onClick={() => navigate('decisions')}>
                        Open library
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <EvidenceMap
                      snapshot={snapshot}
                      findings={assessment.findings}
                      excluded={excluded}
                      onSelect={setSelected}
                    />
                    <div className="graph-footer">
                      <span>
                        <i className="signal-dot critical" />
                        Needs another look
                        <i className="signal-dot green" />
                        In sync
                      </span>
                      <span>
                        <ShieldCheck size={13} />
                        Explicit links. Traceable evidence.
                      </span>
                    </div>
                  </section>

                  <section className="findings-section">
                    <div className="section-top">
                      <div>
                        <h2>
                          A few things to look at{' '}
                          <span className="subtle-pill">{assessment.findings.length}</span>
                        </h2>
                        <p>Every signal has a source. Every next step stays yours.</p>
                      </div>
                      <button className="text-button" onClick={exportReview}>
                        <Download size={14} />
                        Export review
                      </button>
                    </div>
                    <div className="finding-list">
                      {filteredFindings.map((finding) => (
                        <FindingRow
                          key={finding.id}
                          finding={finding}
                          onClick={() => setSelected(finding.id)}
                          selected={selected === finding.id}
                        />
                      ))}
                      {!filteredFindings.length && (
                        <div className="empty-state">
                          <CheckCheck size={28} />
                          <h3>
                            {query
                              ? 'No signals match your search'
                              : 'No open signals in this scope'}
                          </h3>
                          <p>
                            {query
                              ? 'Try a work item key or a decision title.'
                              : 'The selected commitments pass their checks. This is advisory, not deployment approval.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                  <div className="bottom-nudge">
                    <span className="little-spark">
                      <FlaskConical size={18} />
                    </span>
                    <div>
                      <strong>What if a smaller release was the better release?</strong>
                      <p>Try a scope change and see what it actually resolves.</p>
                    </div>
                    <button onClick={() => navigate('scenario')}>
                      Step into the what-if lab
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}

              {page === 'decisions' && (
                <div className="library-grid">
                  {snapshot.decisions
                    .filter((decision) =>
                      `${decision.title} ${decision.owner}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((decision, index) => (
                      <button
                        className="decision-card"
                        key={decision.id}
                        onClick={() => setSelected(decision.id)}
                      >
                        <div className="card-top">
                          <SourceIcon type="confluence" />
                          <span className="card-index">DECISION / 0{index + 1}</span>
                          <ArrowUpRight size={18} />
                        </div>
                        <Tag
                          tone={
                            !decision.accessible
                              ? 'unknown'
                              : decision.currentVersion !== decision.reviewedVersion
                                ? 'critical'
                                : 'success'
                          }
                        >
                          {!decision.accessible
                            ? 'Source unavailable'
                            : decision.currentVersion !== decision.reviewedVersion
                              ? 'Page changed · review needed'
                              : 'Baseline in sync'}
                        </Tag>
                        <h2>{decision.title}</h2>
                        <p>{decision.contract.rationale}</p>
                        <div className="decision-card-meta">
                          <span>Reviewed v{decision.reviewedVersion}</span>
                          <ArrowRight size={13} />
                          <span>Current v{decision.currentVersion}</span>
                        </div>
                        <div className="decision-card-bottom">
                          <span className="avatar tiny">
                            {decision.owner
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </span>
                          <span>{decision.owner}</span>
                          <span>
                            {decision.contract.rules.length} commitment
                            {decision.contract.rules.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              )}

              {page === 'scenario' && (
                <>
                  <div className="lab-notice">
                    <FlaskConical size={20} />
                    <div>
                      <strong>A sandbox for better questions.</strong>
                      <p>
                        Uncheck work to defer it from the hypothetical scope. Dependencies remain
                        requirements for any affected work still included.
                      </p>
                    </div>
                    <Tag tone="purple">SIMULATION ONLY</Tag>
                  </div>
                  <div className="lab-grid">
                    <section className="panel scope-panel">
                      <div className="section-top">
                        <div>
                          <h2>Shape the release</h2>
                          <p>
                            {assessment.scope.length} included · {excluded.length} deferred
                          </p>
                        </div>
                        <button className="text-button" onClick={() => setExcluded([])}>
                          Reset
                        </button>
                      </div>
                      <div className="scope-list">
                        {snapshot.issues
                          .filter(
                            (issue) =>
                              issue.inScope &&
                              `${issue.key} ${issue.summary}`
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                          )
                          .map((issue) => (
                            <label
                              key={issue.key}
                              className={`scope-item ${excluded.includes(issue.key) ? 'deferred' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={!excluded.includes(issue.key)}
                                onChange={() => toggleExclude(issue.key)}
                              />
                              <span className="custom-check">
                                <Check size={12} />
                              </span>
                              <div>
                                <span className="issue-key">{issue.key}</span>
                                <strong>{issue.summary}</strong>
                                <small>
                                  {issue.assignee ?? 'Unassigned'} ·{' '}
                                  {isLive ? '1 scope item' : `${issue.effort} effort points`}
                                </small>
                              </div>
                              <Tag tone={issue.statusCategory === 'done' ? 'success' : 'neutral'}>
                                {issue.status}
                              </Tag>
                            </label>
                          ))}
                      </div>
                    </section>
                    <div className="lab-results">
                      <section className="panel comparison">
                        <div className="section-top">
                          <h2>A different picture</h2>
                          <FlaskConical size={17} />
                        </div>
                        <div className="before-after">
                          <div>
                            <small>Current scope</small>
                            <strong>{baseline.findings.length.toString().padStart(2, '0')}</strong>
                            <span>open signals</span>
                          </div>
                          <ArrowRight size={24} />
                          <div>
                            <small>What-if scope</small>
                            <strong
                              className={
                                assessment.findings.length < baseline.findings.length
                                  ? 'improved'
                                  : ''
                              }
                            >
                              {assessment.findings.length.toString().padStart(2, '0')}
                            </strong>
                            <span>open signals</span>
                          </div>
                        </div>
                        <div className="comparison-lines">
                          <span>
                            Critical signals
                            <strong>
                              {baseline.findings.filter((f) => f.severity === 'critical').length}{' '}
                              <ArrowRight size={13} /> {critical}
                            </strong>
                          </span>
                          <span>
                            Work included
                            <strong>
                              {scopeCount} <ArrowRight size={13} /> {assessment.scope.length}
                            </strong>
                          </span>
                          <span>
                            {isLive ? 'Items deferred' : 'Effort deferred'}
                            <strong>
                              {snapshot.issues
                                .filter((i) => excluded.includes(i.key))
                                .reduce((sum, i) => sum + i.effort, 0)}
                              {isLive ? '' : ' pts'}
                            </strong>
                          </span>
                        </div>
                        <p className="fineprint">
                          Deferring work removes its applicability from this scenario. It does not
                          fix the underlying decision or update Jira.
                        </p>
                      </section>
                      <section className="suggestion-card">
                        <Sparkles size={20} />
                        <h3>Find a smaller path forward.</h3>
                        <p>
                          Search all scope combinations for the lowest-cost deferral that clears
                          critical signals. Warnings may remain.
                        </p>
                        <button
                          className="button dark"
                          onClick={() => {
                            const plan = findSmallestSafeScope(snapshot);
                            if (!plan) {
                              setToast(
                                scopeCount > 15
                                  ? 'Automatic search supports up to 15 items. Try manual scope changes.'
                                  : 'No qualifying non-empty scope found. Review the missing evidence.',
                              );
                              return;
                            }
                            setExcluded(plan.excludedKeys);
                            setToast(
                              `Compared ${plan.evaluatedPlans} candidate scopes. ${plan.excludedKeys.length} item(s) deferred in this simulation.`,
                            );
                          }}
                        >
                          Find smallest deferral
                          <ArrowRight size={15} />
                        </button>
                        <small>Exact search · up to 15 items · no AI guesswork</small>
                      </section>
                    </div>
                  </div>
                  <section className="scenario-results">
                    <div className="section-top">
                      <h2>
                        What remains to review{' '}
                        <span className="subtle-pill">{assessment.findings.length}</span>
                      </h2>
                      <button className="text-button" onClick={exportReview}>
                        <Download size={14} />
                        Export scenario
                      </button>
                    </div>
                    <div className="finding-list">
                      {assessment.findings.map((finding) => (
                        <FindingRow
                          key={finding.id}
                          finding={finding}
                          onClick={() => setSelected(finding.id)}
                          selected={selected === finding.id}
                        />
                      ))}
                      {!assessment.findings.length && (
                        <div className="empty-state">
                          <CheckCheck size={28} />
                          <h3>No open signals in this simulation</h3>
                          <p>
                            Review the tradeoff with your team. The current release is unchanged.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}

              {page === 'history' && (
                <HistoryPanel
                  snapshot={snapshot}
                  revision={historyRevision}
                  query={query}
                  onFirstReview={() => {
                    setExcluded([]);
                    setModal(true);
                  }}
                />
              )}
              {page === 'settings' && (
                <Settings
                  snapshot={snapshot}
                  anchor={anchor}
                  setAnchor={setAnchor}
                  onLoaded={async () => {
                    if (await refresh()) navigate('review');
                  }}
                  onAddDecision={addDemoDecision}
                  onDemo={updateDemo}
                  onReset={() => {
                    resetDemo();
                    setSnapshot(createDemoSnapshot());
                    setHistoryRevision((previous) => previous + 1);
                    setExcluded([]);
                    setToast('Demo restored to its starting point.');
                  }}
                />
              )}
            </>
          )}
          {!snapshot && (
            <Settings
              snapshot={null}
              anchor={anchor}
              setAnchor={setAnchor}
              onLoaded={async () => {
                if (await refresh()) navigate('review');
              }}
              onAddDecision={addDemoDecision}
              onDemo={updateDemo}
              onReset={() => {}}
            />
          )}
          <footer className="page-footer">
            <span>
              <Logo small />A little more context. A better call.
            </span>
            <span>
              {snapshot ? snapshotId(snapshot) : 'Accord'}
              <span className="footer-dot">·</span>Made for teams that care about the why.
            </span>
          </footer>
        </main>
      </div>

      {(selectedFinding || selectedDecision) && snapshot && (
        <Inspector
          snapshot={snapshot}
          finding={selectedFinding}
          decision={selectedDecision}
          onClose={() => setSelected(null)}
          onReview={
            excluded.length === 0 && selectedDecision
              ? () => {
                  setSourceReview({ snapshot, decision: selectedDecision });
                  setSelected(null);
                }
              : undefined
          }
          onSimulate={(keys) => {
            setExcluded(keys);
            setSelected(null);
            setPage('scenario');
          }}
        />
      )}
      {modal && snapshot && (
        <RecordModal
          snapshot={snapshot}
          onClose={() => setModal(false)}
          onRecorded={() => {
            setHistoryRevision((previous) => previous + 1);
            setModal(false);
            setToast(
              isLive
                ? 'Decision recorded as a Jira comment.'
                : 'Decision saved locally in this demo.',
            );
            setPage('history');
          }}
        />
      )}
      {sourceReview && (
        <SourceReview
          snapshot={sourceReview.snapshot}
          decision={sourceReview.decision}
          onClose={() => setSourceReview(null)}
          onAdopted={(next) => {
            setSnapshot(next);
            setSourceReview(null);
            setExcluded([]);
            setToast('New source baseline adopted. Other commitments have been re-evaluated.');
          }}
        />
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
