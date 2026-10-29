import type { Contract, Decision } from './schema';

export interface ContractChange {
  field: string;
  before: string;
  after: string;
  kind: 'added' | 'removed' | 'changed';
}

export function contractChanges(before: Contract, after: Contract): ContractChange[] {
  const result: ContractChange[] = [];
  for (const key of ['title', 'owner', 'rationale'] as const) {
    if (before[key] !== after[key])
      result.push({ field: key, before: before[key], after: after[key], kind: 'changed' });
  }
  const removed = before.appliesTo.filter((key) => !after.appliesTo.includes(key));
  const added = after.appliesTo.filter((key) => !before.appliesTo.includes(key));
  if (removed.length || added.length)
    result.push({
      field: 'Applicable work',
      before: removed.join(', ') || 'None removed',
      after: added.join(', ') || 'None added',
      kind: 'changed',
    });
  const ids = [...new Set([...before.rules, ...after.rules].map((rule) => rule.id))];
  for (const id of ids) {
    const previous = before.rules.find((rule) => rule.id === id);
    const next = after.rules.find((rule) => rule.id === id);
    const describe = (rule: typeof previous) =>
      rule
        ? `${rule.kind}${rule.kind === 'requires_done' ? ` · ${rule.issueKey}` : rule.kind === 'forbids_label' ? ` · ${rule.label}` : ''}: ${rule.summary}`
        : 'Not present';
    if (describe(previous) === describe(next)) continue;
    result.push({
      field: `Commitment: ${id}`,
      before: describe(previous),
      after: describe(next),
      kind: !previous ? 'added' : !next ? 'removed' : 'changed',
    });
  }
  return result;
}

export function adoptDemoDecision(decision: Decision): Decision {
  if (!decision.accessible) throw new Error('The source must be readable before review.');
  return {
    ...decision,
    reviewedVersion: decision.currentVersion,
    reviewedExcerpt: decision.currentExcerpt,
    contract: structuredClone(decision.currentContract ?? decision.contract),
  };
}

export function contractStorageBlock(contract: Contract): string {
  // Split CDATA terminators so arbitrary user text remains data inside the code macro.
  const json = JSON.stringify(contract, null, 2).replace(/\]\]>/g, ']]]]><![CDATA[>');
  return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[${json}]]></ac:plain-text-body></ac:structured-macro>`;
}
