import type { Assessment, Finding, Snapshot } from './schema';

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
    if (decision.currentVersion !== decision.reviewedVersion) {
      findings.push({
        id: `${decision.id}:version`,
        kind: 'page_changed',
        severity: 'critical',
        title: 'The decision page changed after review',
        explanation: `Confluence is at v${decision.currentVersion}; this release was reviewed against v${decision.reviewedVersion}. A page edit is a review signal, not proof of a semantic contradiction.`,
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
          'Have a reviewer inspect the source changes, or defer the affected scope. A comment does not reapprove the baseline.',
      });
    }
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
