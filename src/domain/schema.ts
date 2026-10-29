import { z } from 'zod';

export const issueKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*-\d+$/)
  .max(80);
export const ruleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1).max(80),
      kind: z.literal('requires_done'),
      issueKey,
      summary: z.string().min(1).max(300),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(80),
      kind: z.literal('forbids_label'),
      label: z.string().min(1).max(100),
      summary: z.string().min(1).max(300),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(80),
      kind: z.literal('requires_owner'),
      summary: z.string().min(1).max(300),
    })
    .strict(),
]);
export const contractSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(160),
    owner: z.string().min(1).max(100),
    rationale: z.string().min(1).max(1200),
    appliesTo: z.array(issueKey).min(1).max(50),
    rules: z.array(ruleSchema).max(20),
  })
  .strict()
  .superRefine((contract, ctx) => {
    if (new Set(contract.rules.map((rule) => rule.id)).size !== contract.rules.length) {
      ctx.addIssue({ code: 'custom', message: 'Rule IDs must be unique.' });
    }
  });
export type Contract = z.infer<typeof contractSchema>;

export interface Issue {
  key: string;
  summary: string;
  status: string;
  statusCategory: 'new' | 'indeterminate' | 'done';
  assignee: string | null;
  labels: string[];
  updated: string;
  url: string;
  effort: number;
  inScope: boolean;
}
export interface Decision {
  id: string;
  pageId: string;
  title: string;
  url: string;
  owner: string;
  reviewedVersion: number;
  currentVersion: number;
  reviewedExcerpt: string;
  currentExcerpt: string;
  currentAppliesTo?: string[];
  updated: string;
  accessible: boolean;
  contract: Contract;
}
export interface Release {
  name: string;
  project: string;
  version: string;
  anchorIssue: string;
  targetDate: string;
}
export interface Snapshot {
  mode: 'demo' | 'live';
  capturedAt: string;
  release: Release;
  issues: Issue[];
  decisions: Decision[];
  coverage: { complete: boolean; warnings: string[] };
}
export interface Finding {
  id: string;
  kind: 'page_changed' | 'dependency' | 'forbidden_label' | 'owner' | 'unknown';
  severity: 'critical' | 'warning' | 'unknown';
  title: string;
  explanation: string;
  decisionId: string | null;
  affectedKeys: string[];
  evidence: { label: string; detail: string; url?: string }[];
  remedy: string;
}
export interface Assessment {
  findings: Finding[];
  scope: Issue[];
  excludedKeys: string[];
  verdict: 'review' | 'unknown' | 'clear';
  checkedRules: number;
}
export interface RecordInput {
  outcome: 'hold' | 'proceed_with_conditions';
  rationale: string;
  snapshotToken: string;
}
export interface DecisionRecord {
  id: string;
  outcome: RecordInput['outcome'];
  rationale: string;
  actor: string;
  recordedAt: string;
  snapshotId: string;
  findingCount: number;
  url?: string;
}
export const configurationSchema = z
  .object({
    project: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .max(40),
    version: z.string().min(1).max(120),
    anchorIssue: issueKey,
    targetDate: z.iso.date(),
    pageIds: z.array(z.string().regex(/^\d+$/).max(40)).min(1).max(10),
  })
  .strict();
export type Configuration = z.infer<typeof configurationSchema>;
