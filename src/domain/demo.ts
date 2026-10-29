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
    reviewedExcerpt:
      'Refresh tokens may remain valid for 30 days. Rotation is optional for the first release.',
    currentExcerpt:
      'Rotate refresh tokens on every use. Rotation regression tests must pass before the new session flow ships.',
    contract: {
      schemaVersion: 1,
      title: 'Session security & token rotation',
      owner: 'Maya Chen',
      rationale:
        'A session release must meet the agreed security baseline before it reaches customers.',
      appliesTo: ['PLAT-142'],
      rules: [
        {
          id: 'rotation-tests',
          kind: 'requires_done',
          issueKey: 'PLAT-139',
          summary:
            'Token rotation regression tests must be Done before the session refresh flow ships.',
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
    reviewedExcerpt: 'Assign a named owner for the canary rollout and rollback window.',
    currentExcerpt: 'Assign a named owner for the canary rollout and rollback window.',
    contract: {
      schemaVersion: 1,
      title: 'Progressive delivery playbook',
      owner: 'Jonah Rivera',
      rationale: 'Someone needs to own the rollback decision during the release window.',
      appliesTo: ['PLAT-148'],
      rules: [
        {
          id: 'rollout-owner',
          kind: 'requires_owner',
          summary: 'Every rollout task needs a named owner before the release window.',
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
    contract: {
      schemaVersion: 1,
      title: 'API compatibility promise',
      owner: 'Priya Shah',
      rationale: 'Existing integrations must keep working.',
      appliesTo: ['PLAT-145', 'PLAT-146'],
      rules: [
        {
          id: 'no-breaking-change',
          kind: 'forbids_label',
          label: 'breaking-change',
          summary: 'No work labelled breaking-change can ship under this compatibility decision.',
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
    decisions,
    coverage: { complete: true, warnings: [] },
  } satisfies Snapshot);
}
