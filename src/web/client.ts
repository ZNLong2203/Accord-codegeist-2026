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
export async function draftCommitments(
  snapshot: Snapshot,
  pageId: string,
): Promise<CommitmentDraft> {
  if (isLive) {
    const { invoke } = await import('@forge/bridge');
    return unwrap(await invoke<CommitmentDraft>('draftCommitments', { pageId }));
  }
  const decision = snapshot.decisions.find((item) => item.pageId === pageId);
  if (!decision?.currentContract) throw new Error('This demo page has no prepared draft.');
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
