import type {
  Contract,
  Rule,
  Configuration,
  DecisionRecord,
  HistoryPage,
  RecordInput,
  Snapshot,
} from '../domain/schema';
import { createDemoSnapshot } from '../domain/demo';
import { assess, snapshotId, snapshotToken } from '../domain/engine';
import { adoptDemoDecision } from '../domain/changes';
import type { GraphContext } from '../domain/graph';
import { changeTexts, type ChangeAssessment } from '../domain/drift';
import {
  issueContext,
  pageStatus,
  type IssueReviewContext,
  type PageStatus,
} from '../domain/context';
function unwrap<T>(value: T | { body: T; metadata?: unknown }): T {
  return value && typeof value === 'object' && 'body' in value ? value.body : (value as T);
}

export const isLive =
  new URLSearchParams(window.location.search).get('mode') === 'live' || window.self !== window.top;
const storageKey = 'accord.demo.v1';
const historyKey = 'accord.history.v1';

export function readHistory(): DecisionRecord[] {
  if (isLive) return [];
  try {
    return JSON.parse(localStorage.getItem(historyKey) ?? '[]');
  } catch {
    return [];
  }
}

export function saveDemo(snapshot: Snapshot) {
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export async function getSnapshot(anchorIssue: string): Promise<Snapshot> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(await invoke<Snapshot>('getSnapshot', { anchorIssue }));
  }
  try {
    const previous = localStorage.getItem(storageKey);
    if (previous) return { ...JSON.parse(previous), capturedAt: new Date().toISOString() };
  } catch {
    /* A damaged local demo can be safely restored from the fixture. */
  }
  return createDemoSnapshot();
}

export async function saveConfiguration(configuration: Configuration) {
  const { invoke } = await import('@forge/bridge');
  return invoke('configure', configuration);
}

export async function record(snapshot: Snapshot, input: RecordInput): Promise<DecisionRecord> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(
      await invoke<DecisionRecord>('recordDecision', {
        anchorIssue: snapshot.release.anchorIssue,
        input,
      }),
    );
  }
  const existing = input.requestId
    ? readHistory().find((item) => item.requestId === input.requestId)
    : null;
  if (existing) {
    if (existing.rationale !== input.rationale || existing.outcome !== input.outcome)
      throw new Error('This request was already recorded with different content.');
    return existing;
  }
  const latest = await getSnapshot(snapshot.release.anchorIssue);
  if (snapshotToken(latest) !== input.snapshotToken)
    throw new Error('The evidence changed. Refresh and review it before recording.');
  const item: DecisionRecord = {
    id: crypto.randomUUID(),
    outcome: input.outcome,
    rationale: input.rationale,
    actor: 'Alex Morgan · demo reviewer',
    recordedAt: new Date().toISOString(),
    snapshotId: snapshotId(snapshot),
    findingCount: assess(snapshot).findings.length,
    requestId: input.requestId,
  };
  localStorage.setItem(historyKey, JSON.stringify([item, ...readHistory()]));
  return item;
}

export async function getHistory(anchorIssue: string, startAt = 0): Promise<HistoryPage> {
  if (!isLive) return { records: readHistory(), nextStartAt: null };
  const { invoke } = await import('@forge/bridge');
  return unwrap(await invoke<HistoryPage>('getHistory', { anchorIssue, startAt }));
}

export interface CommitmentDraft {
  pageId: string;
  pageVersion: number;
  pageTitle: string;
  model: string;
  draft: {
    title: string;
    owner: string;
    appliesTo: string[];
    accepted: Rule[];
    rejected: { summary: string; quote: string; reason: string }[];
  };
  existing: Contract | null;
}

/** Live: Forge LLM drafts from the page. Demo: the fixture's prepared draft, labelled as such. */
/** Local demo only: is a model configured on the Vite dev server? */
async function devModel(): Promise<string | null> {
  if (isLive) return null;
  try {
    const response = await fetch('/__dev-ai/status');
    const body = await response.json();
    return body.enabled ? String(body.model) : null;
  } catch {
    return null;
  }
}
async function devPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/__dev-ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'The local model call failed.');
  return result as T;
}

export async function draftCommitments(
  snapshot: Snapshot | null,
  pageId: string,
): Promise<CommitmentDraft> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(await invoke<CommitmentDraft>('draftCommitments', { pageId }));
  }
  const decision = (snapshot ?? (await getSnapshot(''))).decisions.find(
    (item) => item.pageId === pageId,
  );
  if (!decision?.currentContract) throw new Error('This demo page has no prepared draft.');
  if (await devModel()) {
    const { model, draft } = await devPost<{ model: string; draft: CommitmentDraft['draft'] }>(
      'draft',
      { pageTitle: decision.title, pageText: decision.currentText ?? decision.currentExcerpt },
    );
    return {
      pageId,
      pageVersion: decision.currentVersion,
      pageTitle: decision.title,
      model: `${model} · local demo`,
      draft,
      existing: null,
    };
  }
  await new Promise((resolve) => setTimeout(resolve, 700));
  const contract = decision.currentContract;
  return {
    pageId,
    pageVersion: decision.currentVersion,
    pageTitle: decision.title,
    model: 'Demo draft · no model call',
    draft: {
      title: contract.title,
      owner: contract.owner,
      appliesTo: contract.appliesTo,
      accepted: contract.rules,
      rejected: [],
    },
    existing: null,
  };
}

export interface ConfirmInput {
  pageVersion: number;
  title: string;
  owner: string;
  appliesTo: string[];
  rules: Rule[];
}

/** Saves confirmed commitments on the page, then adopts that exact version as the baseline. */
export async function confirmAndAdopt(
  snapshot: Snapshot,
  pageId: string,
  input: ConfirmInput,
): Promise<Snapshot> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    await invoke('confirmCommitments', { pageId, ...input });
    const fresh = await getSnapshot(snapshot.release.anchorIssue);
    const decision = fresh.decisions.find((item) => item.pageId === pageId);
    if (decision?.currentVersion !== input.pageVersion)
      throw new Error('The decision page changed again. Review the new version.');
    return reviewBaseline(fresh, pageId);
  }
  const next: Snapshot = {
    ...snapshot,
    decisions: snapshot.decisions.map((decision) =>
      decision.pageId === pageId
        ? {
            ...decision,
            currentContract: {
              schemaVersion: 1,
              title: input.title,
              owner: input.owner,
              rationale: input.rules.find((rule) => rule.kind === 'stated')?.quote ?? input.title,
              appliesTo: input.appliesTo,
              rules: input.rules,
            },
          }
        : decision,
    ),
  };
  saveDemo(next);
  return reviewBaseline(next, pageId);
}

export interface SampleTargets {
  projects: { key: string; name: string }[];
  spaces: { key: string; name: string }[];
}
export async function listSampleTargets(): Promise<SampleTargets> {
  const { invoke } = await import('@forge/bridge');
  return unwrap(await invoke<SampleTargets>('listSampleTargets'));
}
export async function createSampleRelease(projectKey: string, spaceKey: string) {
  const { invoke } = await import('@forge/bridge');
  return unwrap(
    await invoke<{ anchorIssue: string; issues: string[]; warnings: string[] }>(
      'createSampleRelease',
      { projectKey, spaceKey },
    ),
  );
}

export async function reviewBaseline(snapshot: Snapshot, pageId: string): Promise<Snapshot> {
  const token = snapshotToken(snapshot);
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    await invoke('adoptBaseline', {
      anchorIssue: snapshot.release.anchorIssue,
      input: { pageId, snapshotToken: token },
    });
    return getSnapshot(snapshot.release.anchorIssue);
  }
  const current = await getSnapshot(snapshot.release.anchorIssue);
  if (snapshotToken(current) !== token)
    throw new Error('The evidence changed. Refresh before adopting a baseline.');
  const next = {
    ...snapshot,
    capturedAt: new Date().toISOString(),
    decisions: snapshot.decisions.map((decision) =>
      decision.pageId === pageId ? adoptDemoDecision(decision) : decision,
    ),
  };
  saveDemo(next);
  return next;
}

export function resetDemo() {
  localStorage.removeItem(storageKey);
  localStorage.removeItem(historyKey);
}

export async function getPageStatus(pageId: string): Promise<PageStatus> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(await invoke<PageStatus>('getPageStatus', { pageId }));
  }
  const snapshot = await getSnapshot('');
  const decision =
    snapshot.decisions.find((item) => item.pageId === pageId) ?? snapshot.decisions[0];
  return pageStatus({
    pageId: decision.pageId,
    title: decision.title,
    currentVersion: decision.currentVersion,
    confirmedVersion: decision.reviewedVersion,
    contract: decision.contract,
    confirmedText: decision.reviewedText ?? null,
    currentText: decision.currentText ?? decision.currentExcerpt,
    issues: snapshot.issues.map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      done: issue.statusCategory === 'done',
      url: issue.url,
    })),
  });
}

export interface IssueContextResult {
  reviews: IssueReviewContext[];
  reason: 'no-release' | 'search-unavailable' | 'no-review' | null;
}

export async function getIssueContext(issueKey: string): Promise<IssueContextResult> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(await invoke<IssueContextResult>('getIssueContext', { issueKey }));
  }
  const context = issueContext(await getSnapshot(''), issueKey);
  return context.decisions.length || context.findings.length
    ? { reviews: [context], reason: null }
    : { reviews: [], reason: 'no-review' };
}

const DEMO_GRAPH: GraphContext = {
  source: 'demo',
  available: true,
  people: {
    '1001': {
      owners: [{ name: 'Maya Chen' }],
      contributors: [{ name: 'Maya Chen' }, { name: 'Dev Patel' }],
    },
    '1002': { owners: [{ name: 'Jonah Rivera' }], contributors: [{ name: 'Jonah Rivera' }] },
    '1003': { owners: [{ name: 'Priya Shah' }], contributors: [{ name: 'Priya Shah' }] },
  },
  goals: {
    'PLAT-142': [{ name: 'Halve account-takeover incidents in 2026' }],
    'PLAT-139': [{ name: 'Halve account-takeover incidents in 2026' }],
    'PLAT-145': [{ name: 'Keep partner integrations stable' }],
    'PLAT-146': [{ name: 'Keep partner integrations stable' }],
  },
  note: 'Fictional Teamwork Graph data for the local demo.',
};

/** People and goals from Teamwork Graph. Never affects a check; failures return unavailable. */
export async function getGraphContext(snapshot: Snapshot): Promise<GraphContext> {
  if (!isLive) return DEMO_GRAPH;
  try {
    const { invoke } = await import('@forge/bridge');
    return unwrap(
      await invoke<GraphContext>('getGraphContext', {
        pageIds: snapshot.decisions
          .filter((d) => d.accessible)
          .map((d) => d.pageId)
          .slice(0, 10),
        issues: snapshot.issues
          .filter((issue) => issue.id)
          .sort((a, b) => Number(b.statusCategory === 'done') - Number(a.statusCategory === 'done'))
          .slice(0, 15)
          .map((issue) => ({ key: issue.key, id: issue.id! })),
      }),
    );
  } catch {
    return { source: 'teamwork-graph', available: false, people: {}, goals: {} };
  }
}

/** Live: Forge LLM compares the old and new wording. Demo: a labelled prepared answer. */
export async function explainChange(
  snapshot: Snapshot,
  findingId: string,
): Promise<ChangeAssessment> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(
      await invoke<ChangeAssessment>('explainChange', {
        anchorIssue: snapshot.release.anchorIssue,
        findingId,
      }),
    );
  }
  const texts = changeTexts(snapshot, findingId);
  if (texts && (await devModel())) {
    const result = await devPost<ChangeAssessment>('explain', texts);
    return { ...result, model: `${result.model} · local demo` };
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    relation: 'contradicts',
    reason:
      'Rotating on every use is stricter than daily rotation, so work built to the 24-hour rule no longer matches the decision.',
    model: 'Prepared demo answer · no model call',
  };
}
