import { z } from 'zod';

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
