import Resolver from '@forge/resolver';
import { z } from 'zod';
import { assess, findSmallestSafeScope, snapshotId } from '../domain/engine';
import { issueKey } from '../domain/schema';
import { contractChanges } from '../domain/changes';
import { ruleStatuses } from '../domain/context';
import { sentenceDiff } from '../domain/text';
import {
  adoptBaseline,
  configure,
  confirmCommitments,
  draftCommitments,
  explainChange,
  loadSnapshot,
  recordDecision,
} from './service';
import { createSampleRelease, listSampleTargets } from './sample';
import { getIssueContext, getPageStatus } from './surfaces';
import { loadGraphContext } from './graph';
import { loadHistory } from './history';

const resolver = new Resolver();
const anchorSchema = z.object({ anchorIssue: issueKey });

resolver.define('getSnapshot', async ({ payload, context }) => {
  const { anchorIssue } = anchorSchema.parse(payload);
  return loadSnapshot(anchorIssue, context.siteUrl);
});
resolver.define('configure', async ({ payload }) => configure(payload));
resolver.define('recordDecision', async ({ payload, context }) => {
  const { anchorIssue } = anchorSchema.parse(payload);
  return recordDecision(anchorIssue, payload.input, context.siteUrl);
});
resolver.define('getHistory', async ({ payload, context }) => {
  const { anchorIssue } = anchorSchema.parse(payload);
  return loadHistory(anchorIssue, context.siteUrl, payload.startAt);
});
resolver.define('adoptBaseline', async ({ payload, context }) => {
  const { anchorIssue } = anchorSchema.parse(payload);
  return adoptBaseline(anchorIssue, payload.input, context.siteUrl);
});
resolver.define('draftCommitments', async ({ payload }) => draftCommitments(payload));
resolver.define('confirmCommitments', async ({ payload }) => confirmCommitments(payload));
resolver.define('listSampleTargets', async () => listSampleTargets());
resolver.define('createSampleRelease', async ({ payload }) => createSampleRelease(payload));
resolver.define('getPageStatus', async ({ payload }) => getPageStatus(payload));
resolver.define('getIssueContext', async ({ payload }) => getIssueContext(payload));
resolver.define('getGraphContext', async ({ payload, context }) =>
  loadGraphContext(payload, String(context.cloudId ?? '')),
);
resolver.define('explainChange', async ({ payload, context }) => {
  const { anchorIssue } = anchorSchema.parse(payload);
  return explainChange(anchorIssue, { findingId: payload.findingId }, context.siteUrl);
});
export const handler = resolver.getDefinitions();

/** Rovo/MCP actions are read-only. Human writes remain in the review UI. */
export async function inspectRelease(payload: {
  anchorIssue?: string;
  context?: { siteUrl?: string };
}) {
  const anchor = issueKey.parse(payload.anchorIssue);
  const snapshot = await loadSnapshot(anchor, '');
  return {
    snapshotId: snapshotId(snapshot),
    ...assess(snapshot),
    note: 'Page version changes require human review; they do not prove a semantic contradiction. This is advisory and never authorizes deployment.',
  };
}
export async function simulateScope(payload: { anchorIssue?: string; excludedKeys?: string }) {
  const anchor = issueKey.parse(payload.anchorIssue);
  const excludedKeys = z
    .array(issueKey)
    .max(100)
    .parse(
      (payload.excludedKeys ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  const snapshot = await loadSnapshot(anchor, '');
  return {
    simulated: true,
    snapshotId: snapshotId(snapshot),
    ...assess(snapshot, excludedKeys),
    note: 'A simulation only. Jira and reviewed baselines are unchanged.',
  };
}
export async function suggestScope(payload: { anchorIssue?: string }) {
  const snapshot = await loadSnapshot(issueKey.parse(payload.anchorIssue), '');
  return {
    snapshotId: snapshotId(snapshot),
    plan: findSmallestSafeScope(snapshot),
    note: 'Minimum number of deferred issues, up to 15 scope items; retains at least one item. Warning-level signals may remain. No mutations.',
  };
}

export async function inspectDecisionChange(payload: { anchorIssue?: string; pageId?: string }) {
  const anchor = issueKey.parse(payload.anchorIssue);
  const pageId = z.string().regex(/^\d+$/).parse(payload.pageId);
  const snapshot = await loadSnapshot(anchor, '');
  const decision = snapshot.decisions.find((item) => item.pageId === pageId);
  if (!decision?.accessible)
    throw new Error(
      'This decision is not selected or its source is unavailable to the current user.',
    );
  const sentences =
    decision.reviewedText !== undefined && decision.currentText !== undefined
      ? sentenceDiff(decision.reviewedText, decision.currentText).filter(
          (change) => change.kind !== 'same',
        )
      : null;
  return {
    snapshotId: snapshotId(snapshot),
    pageId,
    source: decision.url,
    reviewedVersion: decision.reviewedVersion,
    currentVersion: decision.currentVersion,
    changedSentences: sentences,
    commitments: ruleStatuses(
      decision.contract,
      decision.reviewedText ?? null,
      decision.currentText ?? decision.currentExcerpt,
    ).map(({ rule, state, replacement }) => ({
      kind: rule.kind,
      summary: rule.summary,
      quote: rule.quote ?? null,
      state,
      nowReads: replacement,
    })),
    confirmedChanges: decision.currentContract
      ? contractChanges(decision.contract, decision.currentContract)
      : null,
    note: 'Sentences are compared exactly after normalising case, whitespace and typography. "nowReads" is the most similar new sentence, a hint rather than a semantic verdict. confirmedChanges is null until someone confirms commitments for the current version. A human must review before adopting a baseline. This action is read-only.',
  };
}
