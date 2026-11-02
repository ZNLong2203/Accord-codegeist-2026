import type { Decision, Issue, Snapshot } from './schema';

const issue = (
  key: string,
  summary: string,
  status: Issue['statusCategory'],
  assignee: string | null,
  effort: number,
  inScope = true,
): Issue => ({
  key,
  summary,
  statusCategory: status,
  status: status === 'done' ? 'Done' : status === 'new' ? 'To do' : 'In progress',
  assignee,
  effort,
  inScope,
  labels: [],
  updated: '2026-10-29T09:10:00Z',
  url: `https://example.atlassian.net/browse/${key}`,
});

const SECURITY_V3 = [
  'Session security & token rotation',
  'Context: the refresh-token session flow (PLAT-142) replaces long-lived browser sessions for every customer.',
  'Decision: Refresh tokens rotate every 24 hours.',
  'PLAT-142 must not ship until the rotation regression suite PLAT-139 is Done.',
  'Owner: Maya Chen, Security.',
].join('\n');
const SECURITY_V4 = [
  'Session security & token rotation',
  'Context: the refresh-token session flow (PLAT-142) replaces long-lived browser sessions for every customer.',
  'Decision: Refresh tokens rotate on every use, and reusing an old refresh token revokes the whole session.',
  'Updated after the 28 October penetration test.',
  'PLAT-142 must not ship until the rotation regression suite PLAT-139 is Done.',
  'Owner: Maya Chen, Security.',
].join('\n');
const ROLLOUT = [
  'Progressive delivery playbook',
  'Every canary rollout needs a named owner for the rollout and rollback window.',
  'PLAT-148 follows this playbook for release 2.8.',
].join('\n');
const API = [
  'API compatibility promise',
  'The public API remains backwards compatible for the October release.',
  'Work labelled breaking-change cannot ship under this promise. It covers PLAT-145 and PLAT-146.',
].join('\n');

const decisions: Decision[] = [
  {
    id: 'token-policy',
    pageId: '1001',
    title: 'Session security & token rotation',
    url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/1001',
    owner: 'Maya Chen',
    reviewedVersion: 3,
    currentVersion: 4,
    updated: '2026-10-29T08:40:00Z',
    accessible: true,
    reviewedExcerpt: 'Refresh tokens rotate every 24 hours.',
    currentExcerpt:
      'Refresh tokens rotate on every use, and reusing an old refresh token revokes the whole session.',
    reviewedText: SECURITY_V3,
    currentText: SECURITY_V4,
    contract: {
      schemaVersion: 1,
      title: 'Session security & token rotation',
      owner: 'Maya Chen',
      rationale: 'Refresh tokens rotate every 24 hours.',
      appliesTo: ['PLAT-142'],
      rules: [
        {
          id: 'rotation-policy',
          kind: 'stated',
          summary: 'Refresh tokens rotate every 24 hours.',
          quote: 'Refresh tokens rotate every 24 hours.',
        },
        {
          id: 'rotation-tests',
          kind: 'requires_done',
          issueKey: 'PLAT-139',
          summary:
            'Token rotation regression tests must be Done before the session refresh flow ships.',
          quote: 'PLAT-142 must not ship until the rotation regression suite PLAT-139 is Done.',
        },
      ],
    },
    currentContract: {
      schemaVersion: 1,
      title: 'Session security & token rotation',
      owner: 'Maya Chen',
      rationale:
        'Refresh tokens rotate on every use, and reusing an old refresh token revokes the whole session.',
      appliesTo: ['PLAT-142'],
      rules: [
        {
          id: 'rotation-policy',
          kind: 'stated',
          summary: 'Refresh tokens rotate on every use; reuse revokes the session.',
          quote:
            'Refresh tokens rotate on every use, and reusing an old refresh token revokes the whole session.',
        },
        {
          id: 'rotation-tests',
          kind: 'requires_done',
          issueKey: 'PLAT-139',
          summary:
            'Token rotation regression tests must be Done before the session refresh flow ships.',
          quote: 'PLAT-142 must not ship until the rotation regression suite PLAT-139 is Done.',
        },
      ],
    },
  },
  {
    id: 'rollout',
    pageId: '1002',
    title: 'Progressive delivery playbook',
    url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/1002',
    owner: 'Jonah Rivera',
    reviewedVersion: 6,
    currentVersion: 6,
    updated: '2026-10-28T13:00:00Z',
    accessible: true,
    reviewedExcerpt:
      'Every canary rollout needs a named owner for the rollout and rollback window.',
    currentExcerpt: 'Every canary rollout needs a named owner for the rollout and rollback window.',
    reviewedText: ROLLOUT,
    currentText: ROLLOUT,
    contract: {
      schemaVersion: 1,
      title: 'Progressive delivery playbook',
      owner: 'Jonah Rivera',
      rationale: 'Every canary rollout needs a named owner for the rollout and rollback window.',
      appliesTo: ['PLAT-148'],
      rules: [
        {
          id: 'rollout-owner',
          kind: 'requires_owner',
          summary: 'Every rollout task needs a named owner before the release window.',
          quote: 'Every canary rollout needs a named owner for the rollout and rollback window.',
        },
      ],
    },
  },
  {
    id: 'api',
    pageId: '1003',
    title: 'API compatibility promise',
    url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/1003',
    owner: 'Priya Shah',
    reviewedVersion: 2,
    currentVersion: 2,
    updated: '2026-10-27T10:00:00Z',
    accessible: true,
    reviewedExcerpt: 'The public API remains backwards compatible for the October release.',
    currentExcerpt: 'The public API remains backwards compatible for the October release.',
    reviewedText: API,
    currentText: API,
    contract: {
      schemaVersion: 1,
      title: 'API compatibility promise',
      owner: 'Priya Shah',
      rationale: 'The public API remains backwards compatible for the October release.',
      appliesTo: ['PLAT-145', 'PLAT-146'],
      rules: [
        {
          id: 'no-breaking-change',
          kind: 'forbids_label',
          label: 'breaking-change',
          summary: 'No work labelled breaking-change can ship under this compatibility decision.',
          quote: 'Work labelled breaking-change cannot ship under this promise.',
        },
      ],
    },
  },
];

export function createDemoSnapshot(): Snapshot {
  return structuredClone({
    mode: 'demo',
    capturedAt: new Date().toISOString(),
    release: {
      name: 'Platform 2.8',
      project: 'PLAT',
      version: '2.8',
      anchorIssue: 'PLAT-150',
      targetDate: '2026-11-06',
    },
    issues: [
      issue('PLAT-142', 'Refresh token session flow', 'done', 'Alex Morgan', 5),
      issue('PLAT-145', 'Versioned API response schema', 'done', 'Priya Shah', 3),
      issue('PLAT-146', 'SDK compatibility checks', 'done', 'Sam Kim', 2),
      issue('PLAT-148', 'Canary rollout & rollback', 'indeterminate', null, 2),
      issue('PLAT-143', 'Account settings redesign', 'done', 'Taylor Brooks', 3),
      issue('PLAT-144', 'Usage analytics events', 'done', 'Alex Morgan', 2),
      issue('PLAT-147', 'Release notes & migration guide', 'done', 'Jonah Rivera', 1),
      issue('PLAT-149', 'Observability dashboard', 'done', 'Sam Kim', 2),
      issue('PLAT-139', 'Token rotation regression tests', 'indeterminate', 'Maya Chen', 3, false),
    ],
    decisions: decisions.map((decision) => ({
      ...decision,
      currentAppliesTo: (decision.currentContract ?? decision.contract).appliesTo,
      currentContract: decision.currentContract ?? decision.contract,
    })),
    coverage: { complete: true, warnings: [] },
  } satisfies Snapshot);
}
