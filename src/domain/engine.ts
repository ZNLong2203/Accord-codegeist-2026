import type { Assessment, Decision, Finding, Snapshot } from './schema';
import { containsQuote, isCosmeticChange, likelyReplacement, sentenceDiff } from './text';

/** Compare complete observed inputs; capture time and presentation order are irrelevant. */
export function snapshotToken(snapshot: Snapshot): string {
  return JSON.stringify({
    release: snapshot.release,
    coverage: snapshot.coverage,
    issues: [...snapshot.issues].sort((a, b) => a.key.localeCompare(b.key)),
    decisions: [...snapshot.decisions].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/** A human-readable label, not a cryptographic signature or authorization token. */
export function snapshotId(snapshot: Snapshot): string {
  let hash = 2166136261;
  for (const character of snapshotToken(snapshot)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `AC-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function assess(snapshot: Snapshot, exclude: string[] = []): Assessment {
  const scopeKeys = new Set(
    snapshot.issues.filter((issue) => issue.inScope).map((issue) => issue.key),
  );
  const excludedKeys = [...new Set(exclude)].filter((key) => scopeKeys.has(key)).sort();
  const scope = snapshot.issues.filter(
    (issue) => issue.inScope && !excludedKeys.includes(issue.key),
  );
  const included = new Set(scope.map((issue) => issue.key));
  const findings: Finding[] = [];
  let checkedRules = 0;

  if (scope.length === 0) {
    findings.push({
      id: 'empty-scope',
      kind: 'unknown',
      severity: 'unknown',
      title: 'There is no work to evaluate',
      explanation: 'A release without visible, included work cannot establish a useful result.',
      decisionId: null,
      affectedKeys: [],
      evidence: [{ label: 'Release scope', detail: 'Zero work items included.' }],
      remedy: 'Include at least one visible work item.',
    });
  }

  if (!snapshot.coverage.complete) {
    findings.push({
      id: 'coverage',
      kind: 'unknown',
      severity: 'unknown',
      title: 'The evidence is incomplete',
      explanation: snapshot.coverage.warnings.join(' ') || 'Some source records could not be read.',
      affectedKeys: [],
      decisionId: null,
      evidence: [
        { label: 'Coverage', detail: 'Partial source data cannot support a clear result.' },
      ],
      remedy: 'Restore access or narrow the configured release, then refresh.',
    });
  }

  for (const decision of snapshot.decisions) {
    if (!decision.accessible) {
      findings.push({
        id: `${decision.id}:access`,
        kind: 'unknown',
        severity: 'unknown',
        title: 'A decision source is unavailable',
        explanation:
          'The current user cannot read or validate this source. Its last known rules cannot establish a clear result.',
        decisionId: decision.id,
        affectedKeys: [],
        evidence: [{ label: 'Confluence', detail: 'Source unavailable or contract invalid.' }],
        remedy: 'Check page access and the Accord contract block, then refresh.',
      });
      continue;
    }
    const affectedKeys = decision.contract.appliesTo.filter((key) => included.has(key));
    const changedPageKeys = [
      ...new Set([...decision.contract.appliesTo, ...(decision.currentAppliesTo ?? [])]),
    ].filter((key) => included.has(key));
    if (
      affectedKeys.length === 0 &&
      (decision.currentVersion === decision.reviewedVersion || changedPageKeys.length === 0)
    )
      continue;
    checkedRules++;
    if (decision.currentVersion !== decision.reviewedVersion)
      findings.push(...versionFindings(snapshot, decision, changedPageKeys, affectedKeys));
    if (affectedKeys.length === 0) continue;
    for (const rule of decision.contract.rules) {
      checkedRules++;
      const source = { label: 'Confirmed commitment', detail: rule.summary, url: decision.url };
      if (rule.kind === 'requires_done') {
        const dependency = snapshot.issues.find((issue) => issue.key === rule.issueKey);
        if (!dependency) {
          findings.push({
            id: `${decision.id}:${rule.id}`,
            kind: 'unknown',
            severity: 'unknown',
            title: `Cannot verify ${rule.issueKey}`,
            explanation: 'The required dependency was not returned to the current user.',
            decisionId: decision.id,
            affectedKeys,
            evidence: [source],
            remedy: 'Restore access to the dependency and refresh.',
          });
        } else if (dependency.statusCategory !== 'done') {
          findings.push({
            id: `${decision.id}:${rule.id}`,
            kind: 'dependency',
            severity: 'critical',
            title: `${dependency.key} is still ${dependency.status.toLowerCase()}`,
            explanation: `The selected decision requires this work to be done before ${affectedKeys.join(', ')} ships.`,
            decisionId: decision.id,
            affectedKeys,
            evidence: [
              source,
              {
                label: 'Required work',
                detail: `${dependency.key} · ${dependency.summary} · ${dependency.status}`,
                url: dependency.url,
              },
            ],
            remedy:
              'Complete the prerequisite in Jira and refresh, or defer the work that depends on it.',
          });
        }
      } else if (rule.kind === 'forbids_label') {
        const violating = scope.filter(
          (issue) => affectedKeys.includes(issue.key) && issue.labels.includes(rule.label),
        );
        if (violating.length)
          findings.push({
            id: `${decision.id}:${rule.id}`,
            kind: 'forbidden_label',
            severity: 'critical',
            title: `Scope still includes “${rule.label}”`,
            explanation: rule.summary,
            decisionId: decision.id,
            affectedKeys: violating.map((issue) => issue.key),
            evidence: [
              source,
              ...violating.map((issue) => ({
                label: issue.key,
                detail: issue.summary,
                url: issue.url,
              })),
            ],
            remedy: 'Inspect and correct the Jira evidence or defer the affected work.',
          });
      } else if (rule.kind === 'stated') {
        // Tracked through its source sentence in versionFindings; no Jira field to check.
      } else if (rule.kind === 'requires_owner') {
        const unowned = scope.filter(
          (issue) => affectedKeys.includes(issue.key) && !issue.assignee,
        );
        if (unowned.length)
          findings.push({
            id: `${decision.id}:${rule.id}`,
            kind: 'owner',
            severity: 'warning',
            title: 'The rollout has no accountable owner',
            explanation: rule.summary,
            decisionId: decision.id,
            affectedKeys: unowned.map((issue) => issue.key),
            evidence: [
              source,
              ...unowned.map((issue) => ({
                label: issue.key,
                detail: `${issue.summary} · Unassigned`,
                url: issue.url,
              })),
            ],
            remedy: 'Assign a rollout owner in Jira, then refresh.',
          });
      }
    }
  }
  const verdict = findings.some((finding) => finding.severity === 'unknown')
    ? 'unknown'
    : findings.length
      ? 'review'
      : 'clear';
  return { findings, scope, excludedKeys, verdict, checkedRules };
}

/**
 * Turns a page version change into the most specific signal the evidence supports:
 * a commitment whose source sentence disappeared, a substantive edit, or a
 * formatting-only edit. Without page text it falls back to a version signal.
 */
function versionFindings(
  snapshot: Snapshot,
  decision: Decision,
  changedPageKeys: string[],
  affectedKeys: string[],
): Finding[] {
  const { reviewedText, currentText } = decision;
  const versions = `v${decision.reviewedVersion} → v${decision.currentVersion}`;
  const generic = (detail: string): Finding => ({
    id: `${decision.id}:version`,
    kind: 'page_changed',
    severity: 'critical',
    title: 'The decision page changed after review',
    explanation: `Confluence is at v${decision.currentVersion}; this release was reviewed against v${decision.reviewedVersion}. ${detail}`,
    decisionId: decision.id,
    affectedKeys: changedPageKeys,
    evidence: [
      {
        label: 'Reviewed baseline',
        detail: `v${decision.reviewedVersion} · ${decision.reviewedExcerpt}`,
      },
      {
        label: 'Current source',
        detail: `v${decision.currentVersion} · ${decision.currentExcerpt}`,
        url: decision.url,
      },
      { label: 'Release scope', detail: changedPageKeys.join(', ') },
    ],
    remedy:
      'Compare the versions and re-confirm the commitments, or defer the affected scope. A comment does not reapprove the baseline.',
  });
  if (reviewedText === undefined || currentText === undefined)
    return [generic('Open the comparison to see what changed.')];

  const changes = sentenceDiff(reviewedText, currentText);
  const changedSentences = changes.filter((change) => change.kind !== 'same').length;
  const lost = decision.contract.rules.filter(
    (rule) => rule.quote && !containsQuote(currentText, rule.quote),
  );
  if (lost.length) {
    const status = (key: string) => {
      const issue = snapshot.issues.find((item) => item.key === key);
      return issue ? `${key} · ${issue.summary} · ${issue.status}` : key;
    };
    return lost.map((rule) => {
      const replacement = likelyReplacement(rule.quote!, changes);
      const done = affectedKeys.filter(
        (key) => snapshot.issues.find((issue) => issue.key === key)?.statusCategory === 'done',
      );
      const keys = affectedKeys.length ? affectedKeys : changedPageKeys;
      return {
        id: `${decision.id}:${rule.id}:source`,
        kind: 'commitment_changed',
        severity: 'critical',
        title: done.length
          ? `${done.join(', ')} ${done.length === 1 ? 'was' : 'were'} built on a commitment that changed`
          : 'A confirmed commitment changed at its source',
        explanation: `The sentence this commitment was confirmed from is no longer on the page (${versions}).${
          replacement
            ? ' A similar sentence now reads differently.'
            : ' No similar sentence remains.'
        }`,
        decisionId: decision.id,
        affectedKeys: keys,
        evidence: [
          {
            label: `Confirmed in v${decision.reviewedVersion}`,
            detail: `“${rule.quote}”`,
            url: decision.url,
          },
          {
            label: `Now in v${decision.currentVersion}`,
            detail: replacement ? `“${replacement}”` : 'Sentence removed.',
            url: decision.url,
          },
          ...keys.map((key) => ({
            label: 'Work built on it',
            detail: status(key),
            url: snapshot.issues.find((issue) => issue.key === key)?.url,
          })),
        ],
        remedy: done.length
          ? 'Check whether the finished work still matches the decision, then re-confirm the commitments or reopen the work.'
          : 'Re-confirm the commitments against the current page before the work ships.',
      } satisfies Finding;
    });
  }
  if (isCosmeticChange(reviewedText, currentText))
    return [
      {
        ...generic('Only formatting, punctuation or letter case changed.'),
        severity: 'warning',
        title: 'The decision page was reformatted',
        remedy: 'Confirm the new version when convenient; every commitment is still stated.',
      },
    ];
  return [
    generic(
      `${changedSentences} sentence${changedSentences === 1 ? '' : 's'} changed. Every confirmed commitment is still stated, but new text may add obligations.`,
    ),
  ];
}

export interface ScopePlan {
  excludedKeys: string[];
  effortDeferred: number;
  remainingFindings: number;
  evaluatedPlans: number;
  exact: boolean;
}

/** Exhaustive minimum-effort cut, preserving at least one item; bounded to 15 items. */
export function findSmallestSafeScope(snapshot: Snapshot): ScopePlan | null {
  const issues = snapshot.issues.filter((issue) => issue.inScope);
  if (issues.length > 15 || issues.length === 0) return null;
  let best: ScopePlan | null = null;
  const total = 2 ** issues.length;
  for (let mask = 0; mask < total - 1; mask++) {
    const deferred = issues.filter((_, index) => Boolean(mask & (1 << index)));
    const effortDeferred = deferred.reduce((sum, issue) => sum + issue.effort, 0);
    if (best && effortDeferred > best.effortDeferred) continue;
    const result = assess(
      snapshot,
      deferred.map((issue) => issue.key),
    );
    if (result.findings.some((finding) => finding.severity !== 'warning')) continue;
    if (
      !best ||
      effortDeferred < best.effortDeferred ||
      (effortDeferred === best.effortDeferred && deferred.length < best.excludedKeys.length)
    ) {
      best = {
        excludedKeys: deferred.map((issue) => issue.key),
        effortDeferred,
        remainingFindings: result.findings.length,
        evaluatedPlans: total - 1,
        exact: true,
      };
    }
  }
  return best;
}

export function buildDecisionText(
  snapshot: Snapshot,
  input: { outcome: string; rationale: string },
): string {
  const result = assess(snapshot);
  return [
    `Accord release review · ${snapshot.release.name}`,
    `Decision: ${input.outcome === 'hold' ? 'HOLD' : 'PROCEED WITH CONDITIONS'}`,
    `Rationale: ${input.rationale}`,
    `Snapshot: ${snapshotId(snapshot)} · observed ${snapshot.capturedAt}`,
    `Scope: ${result.scope.map((issue) => issue.key).join(', ')}`,
    `Open signals: ${result.findings.length}`,
    ...result.findings.map((finding) => `- [${finding.severity}] ${finding.title}`),
    'Records a human review. Does not resolve findings, update baselines, change scope, or authorize a deployment.',
  ].join('\n');
}
