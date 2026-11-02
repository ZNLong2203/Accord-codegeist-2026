import { z } from 'zod';
import { contractSchema, issueKey, type Contract, type Rule } from './schema';
import { containsQuote, issueKeysIn, normalise } from './text';

/**
 * A model may only *propose* commitments. Every proposal must quote the page
 * verbatim and may only reference issue keys present on the page. Proposals
 * that fail are returned as rejected with a reason, never silently repaired.
 */
export const draftCommitmentSchema = z.object({
  kind: z.enum(['stated', 'requires_done', 'forbids_label', 'requires_owner']),
  summary: z.string().trim().min(1).max(300),
  quote: z.string().trim().min(1).max(500),
  issueKey: z.string().trim().max(80).optional().nullable(),
  label: z.string().trim().max(100).optional().nullable(),
});
/** The envelope is lenient so one malformed proposal cannot discard the rest. */
export const draftSchema = z.object({
  title: z.string().trim().max(160).optional().nullable().catch(null),
  owner: z.string().trim().max(100).optional().nullable().catch(null),
  appliesTo: z.array(z.string().trim().max(80)).max(50).catch([]).default([]),
  commitments: z.array(z.unknown()).max(100),
});
export type DraftCommitment = z.infer<typeof draftCommitmentSchema>;

export interface VerifiedDraft {
  title: string;
  owner: string;
  appliesTo: string[];
  accepted: Rule[];
  rejected: { summary: string; quote: string; reason: string }[];
}

function slug(value: string): string {
  return (
    normalise(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'commitment'
  );
}

export function verifyDraft(raw: unknown, pageText: string, pageTitle: string): VerifiedDraft {
  const draft = draftSchema.parse(raw);
  const keysOnPage = new Set(issueKeysIn(pageText));
  const appliesTo = [...new Set(draft.appliesTo.map((key) => key.toUpperCase()))].filter(
    (key) => issueKey.safeParse(key).success && keysOnPage.has(key),
  );
  const accepted: Rule[] = [];
  const rejected: VerifiedDraft['rejected'] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const raw of draft.commitments.slice(0, 25)) {
    const parsed = draftCommitmentSchema.safeParse(raw);
    if (!parsed.success) {
      const loose = (raw ?? {}) as { summary?: unknown; quote?: unknown };
      rejected.push({
        summary: String(loose.summary ?? 'Malformed proposal').slice(0, 300),
        quote: String(loose.quote ?? '').slice(0, 500),
        reason: 'The proposal did not match the commitment format.',
      });
      continue;
    }
    const item = parsed.data;
    const reject = (reason: string) =>
      rejected.push({ summary: item.summary, quote: item.quote, reason });
    if (!containsQuote(pageText, item.quote)) {
      reject('The quoted sentence does not appear on the page.');
      continue;
    }
    const fingerprint = `${item.kind}:${normalise(item.quote)}:${item.issueKey ?? ''}:${item.label ?? ''}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    let id = slug(item.summary);
    for (let n = 2; ids.has(id); n++) id = `${slug(item.summary)}-${n}`;
    ids.add(id);
    const base = { id, summary: item.summary, quote: item.quote };
    if (item.kind === 'requires_done') {
      const key = item.issueKey?.toUpperCase() ?? '';
      if (!issueKey.safeParse(key).success || !keysOnPage.has(key)) {
        reject('The prerequisite must be a Jira key written on the page.');
        continue;
      }
      if (!issueKeysIn(item.quote.toUpperCase()).includes(key)) {
        reject('The quote must name the prerequisite work item.');
        continue;
      }
      accepted.push({ ...base, kind: 'requires_done', issueKey: key });
    } else if (item.kind === 'forbids_label') {
      const label = item.label?.trim() ?? '';
      const token = new RegExp(
        `(^|[^\\p{L}\\p{N}_-])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_-])`,
        'iu',
      );
      if (!label || !token.test(item.quote)) {
        reject('The forbidden label must be written in the quoted sentence.');
        continue;
      }
      accepted.push({ ...base, kind: 'forbids_label', label });
    } else if (item.kind === 'requires_owner') {
      // "Owner: Security team." names who owns the decision; it does not require
      // that work items have an assignee.
      if (/^(decision\s+)?owners?\s*[:\-–]/i.test(item.quote.trim())) {
        reject('This sentence names the decision owner; it does not require work to be assigned.');
        continue;
      }
      accepted.push({ ...base, kind: 'requires_owner' });
    } else {
      accepted.push({ ...base, kind: 'stated' });
    }
  }
  // A prerequisite is checked, not governed, so it never joins the governed scope.
  const prerequisites = new Set(
    accepted.flatMap((rule) => (rule.kind === 'requires_done' ? [rule.issueKey] : [])),
  );
  return {
    title: (draft.title || pageTitle).slice(0, 160),
    owner: draft.owner?.trim() || 'Unassigned',
    appliesTo: appliesTo.filter((key) => !prerequisites.has(key)),
    accepted: accepted.slice(0, 20),
    rejected,
  };
}

/** Builds the contract a human confirms. Throws when it is not grounded in the page. */
export function confirmedContract(
  input: { title: string; owner: string; appliesTo: string[]; rules: Rule[] },
  pageText: string,
): Contract {
  const contract = contractSchema.parse({
    schemaVersion: 1,
    title: input.title,
    owner: input.owner,
    rationale:
      input.rules.find((rule) => rule.kind === 'stated')?.quote ??
      input.rules[0]?.quote ??
      input.title,
    appliesTo: input.appliesTo,
    rules: input.rules,
  });
  assertGrounded(contract, pageText);
  return contract;
}

export function assertGrounded(contract: Contract, pageText: string) {
  if (!contract.rules.length) throw new Error('Confirm at least one commitment.');
  for (const rule of contract.rules) {
    if (!rule.quote) throw new Error(`“${rule.summary}” needs a source sentence from the page.`);
    if (!containsQuote(pageText, rule.quote))
      throw new Error(`“${rule.quote}” is not on the current page. Refresh and draft again.`);
  }
}
