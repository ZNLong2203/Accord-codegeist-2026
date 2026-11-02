import { assess } from './engine';
import type { Contract, Finding, Rule, Snapshot } from './schema';
import { containsQuote, likelyReplacement, sentenceDiff } from './text';

/** Whether each confirmed commitment is still stated on the current page. */
export interface RuleStatus {
  rule: Rule;
  state: 'stated' | 'changed' | 'unverified';
  replacement: string | null;
}

export function ruleStatuses(
  contract: Contract,
  confirmedText: string | null,
  currentText: string,
): RuleStatus[] {
  const changes = confirmedText === null ? [] : sentenceDiff(confirmedText, currentText);
  return contract.rules.map((rule) => {
    if (!rule.quote) return { rule, state: 'unverified', replacement: null };
    if (containsQuote(currentText, rule.quote)) return { rule, state: 'stated', replacement: null };
    return { rule, state: 'changed', replacement: likelyReplacement(rule.quote, changes) };
  });
}

export interface WorkItemSummary {
  key: string;
  summary: string;
  status: string;
  done: boolean;
  url: string;
}

export interface PageStatus {
  pageId: string;
  title: string;
  currentVersion: number;
  confirmedVersion: number | null;
  contract: Contract | null;
  rules: RuleStatus[];
  governed: WorkItemSummary[];
  prerequisites: WorkItemSummary[];
  /** Done work governed by a commitment whose sentence changed. */
  atRisk: string[];
}

export function pageStatus(input: {
  pageId: string;
  title: string;
  currentVersion: number;
  confirmedVersion: number | null;
  contract: Contract | null;
  confirmedText: string | null;
  currentText: string;
  issues: WorkItemSummary[];
}): PageStatus {
  const { contract } = input;
  const rules = contract ? ruleStatuses(contract, input.confirmedText, input.currentText) : [];
  const byKey = new Map(input.issues.map((issue) => [issue.key, issue]));
  const governed = (contract?.appliesTo ?? []).flatMap((key) => byKey.get(key) ?? []);
  const prerequisites = (contract?.rules ?? []).flatMap((rule) =>
    rule.kind === 'requires_done' && byKey.has(rule.issueKey) ? [byKey.get(rule.issueKey)!] : [],
  );
  const changed = rules.some((status) => status.state === 'changed');
  return {
    pageId: input.pageId,
    title: input.title,
    currentVersion: input.currentVersion,
    confirmedVersion: input.confirmedVersion,
    contract,
    rules,
    governed,
    prerequisites,
    atRisk: changed ? governed.filter((issue) => issue.done).map((issue) => issue.key) : [],
  };
}

export interface IssueDecision {
  title: string;
  url: string;
  owner: string;
  reviewedVersion: number;
  currentVersion: number;
  rules: RuleStatus[];
}

export interface IssueReviewContext {
  anchorIssue: string;
  release: string;
  inScope: boolean;
  decisions: IssueDecision[];
  findings: Finding[];
}

/** What one work item was built against, and which open signals touch it. */
export function issueContext(snapshot: Snapshot, issueKey: string): IssueReviewContext {
  const assessment = assess(snapshot);
  const decisions = snapshot.decisions
    .filter(
      (decision) =>
        decision.accessible &&
        (decision.contract.appliesTo.includes(issueKey) ||
          decision.contract.rules.some(
            (rule) => rule.kind === 'requires_done' && rule.issueKey === issueKey,
          )),
    )
    .map((decision) => ({
      title: decision.title,
      url: decision.url,
      owner: decision.owner,
      reviewedVersion: decision.reviewedVersion,
      currentVersion: decision.currentVersion,
      rules:
        decision.currentText === undefined
          ? decision.contract.rules.map((rule) => ({
              rule,
              state: 'unverified' as const,
              replacement: null,
            }))
          : ruleStatuses(decision.contract, decision.reviewedText ?? null, decision.currentText),
    }));
  const findings = assessment.findings.filter(
    (finding) =>
      finding.affectedKeys.includes(issueKey) ||
      finding.evidence.some((item) => item.detail.startsWith(`${issueKey} ·`)),
  );
  return {
    anchorIssue: snapshot.release.anchorIssue,
    release: snapshot.release.name,
    inScope: snapshot.issues.some((issue) => issue.key === issueKey && issue.inScope),
    decisions,
    findings,
  };
}
