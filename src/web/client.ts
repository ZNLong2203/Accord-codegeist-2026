import type { Configuration, DecisionRecord, RecordInput, Snapshot } from '../domain/schema';
import { createDemoSnapshot } from '../domain/demo';
import { assess, snapshotId, snapshotToken } from '../domain/engine';
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
  };
  localStorage.setItem(historyKey, JSON.stringify([item, ...readHistory()]));
  return item;
}

export function resetDemo() {
  localStorage.removeItem(storageKey);
  localStorage.removeItem(historyKey);
}
