import { z } from 'zod';
import { assess } from './engine';
import type { Snapshot } from './schema';
import { likelyReplacement, sentenceDiff } from './text';

/**
 * What a rewritten commitment means, as judged by a model. Advisory only: it
 * never changes a finding's severity or a verdict.
 */
export const relations = [
  'contradicts',
  'weakens',
  'strengthens',
  'compatible',
  'unclear',
] as const;
export type Relation = (typeof relations)[number];
export interface ChangeAssessment {
  relation: Relation;
  reason: string;
  model: string;
}

const assessmentSchema = z.object({
  relation: z.enum(relations),
  reason: z.string().trim().min(1).max(400),
});

/** Anything malformed becomes "unclear" rather than an invented judgement. */
export function parseAssessment(raw: unknown): { relation: Relation; reason: string } {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success)
    return { relation: 'unclear', reason: 'The model did not return a usable assessment.' };
  return { relation: parsed.data.relation, reason: parsed.data.reason.slice(0, 240) };
}

export const relationLabel: Record<Relation, string> = {
  contradicts: 'Contradicts the old commitment',
  weakens: 'Weakens the old commitment',
  strengthens: 'Strengthens the old commitment',
  compatible: 'Compatible with the old commitment',
  unclear: 'Unclear',
};

/** The old confirmed sentence and the new wording for one changed-commitment finding. */
export function changeTexts(
  snapshot: Snapshot,
  findingId: string,
): { before: string; after: string } | null {
  const finding = assess(snapshot).findings.find((item) => item.id === findingId);
  if (finding?.kind !== 'commitment_changed' || !finding.decisionId) return null;
  const decision = snapshot.decisions.find((item) => item.id === finding.decisionId);
  const rule = decision?.contract.rules.find(
    (item) => `${decision.id}:${item.id}:source` === finding.id,
  );
  if (!decision?.accessible || !rule?.quote || decision.currentText === undefined) return null;
  const changes = sentenceDiff(decision.reviewedText ?? '', decision.currentText);
  const added = changes.filter((change) => change.kind === 'added').map((change) => change.text);
  const after =
    likelyReplacement(rule.quote, changes) ??
    (added.length ? added.slice(0, 4).join(' ') : 'The sentence was removed.');
  return { before: rule.quote, after };
}
