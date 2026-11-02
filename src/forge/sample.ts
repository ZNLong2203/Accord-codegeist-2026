import api, { route, type Response } from '@forge/api';
import { z } from 'zod';
import { confirmedContract } from '../domain/draft';
import { storageToText } from '../domain/text';
import { saveConfirmation } from './commitments';
import { configure } from './service';

/**
 * Creates a small, clearly labelled sample release in the caller's own site so a
 * reviewer can see Accord on real Jira and Confluence data within a minute.
 * Everything runs as the caller and only after explicit confirmation in the UI.
 */
const LABEL = 'accord-sample';

async function ok(response: Response, what: string): Promise<any> {
  if (!response.ok)
    throw new Error(
      `Could not ${what} (HTTP ${response.status}). Check that you can administer the project and create pages in the space.`,
    );
  return response.status === 204 ? {} : response.json();
}

const jira = (path: ReturnType<typeof route>, method = 'GET', body?: unknown) =>
  api.asUser().requestJira(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const confluence = (path: ReturnType<typeof route>, method = 'GET', body?: unknown) =>
  api.asUser().requestConfluence(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export async function listSampleTargets() {
  const [projects, spaces] = await Promise.all([
    ok(await jira(route`/rest/api/3/project/search?maxResults=50&orderBy=name`), 'list projects'),
    ok(await confluence(route`/wiki/api/v2/spaces?limit=50&type=global`), 'list spaces'),
  ]);
  return {
    projects: (projects.values ?? []).map((p: any) => ({ key: p.key, name: p.name })),
    spaces: (spaces.results ?? []).map((s: any) => ({ key: s.key, name: s.name })),
  };
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const storage = (paragraphs: string[]) => paragraphs.map((p) => `<p>${escape(p)}</p>`).join('');

export function securityPage(keys: { session: string; tests: string }, version: 1 | 2) {
  return [
    `Context: the refresh-token session flow (${keys.session}) replaces long-lived browser sessions for every customer.`,
    version === 1
      ? 'Decision: Refresh tokens rotate every 24 hours.'
      : 'Decision: Refresh tokens rotate on every use, and reusing an old refresh token revokes the whole session.',
    ...(version === 2 ? ['Updated after the penetration test review.'] : []),
    `${keys.session} must not ship until the rotation regression suite ${keys.tests} is Done.`,
    'Owner: Security team.',
  ];
}

export function rolloutPage(keys: { rollout: string }) {
  return [
    'Every canary rollout needs a named owner for the rollout and rollback window.',
    `${keys.rollout} follows this playbook for the sample release.`,
    'Rollback must be possible within 15 minutes.',
  ];
}

async function transitionToDone(key: string): Promise<boolean> {
  const { transitions = [] } = await ok(
    await jira(route`/rest/api/3/issue/${key}/transitions`),
    'read workflow transitions',
  );
  const done = transitions.find((t: any) => t.to?.statusCategory?.key === 'done');
  if (!done) return false;
  await ok(
    await jira(route`/rest/api/3/issue/${key}/transitions`, 'POST', {
      transition: { id: done.id },
    }),
    `move ${key} to Done`,
  );
  return true;
}

export async function createSampleRelease(input: unknown) {
  const { projectKey, spaceKey } = z
    .object({
      projectKey: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/)
        .max(40),
      spaceKey: z.string().min(1).max(255),
    })
    .strict()
    .parse(input);
  const warnings: string[] = [];

  const project = await ok(await jira(route`/rest/api/3/project/${projectKey}`), 'read project');
  const issueType =
    project.issueTypes?.find((t: any) => !t.subtask && t.name === 'Task') ??
    project.issueTypes?.find((t: any) => !t.subtask && t.hierarchyLevel === 0) ??
    project.issueTypes?.find((t: any) => !t.subtask);
  if (!issueType) throw new Error('The project has no standard work type for sample items.');
  const me = await ok(await jira(route`/rest/api/3/myself`), 'read your account');

  const stamp = new Date().toISOString().slice(5, 16).replace('T', ' ');
  const versionName = `Accord sample ${stamp}`;
  const version = await ok(
    await jira(route`/rest/api/3/version`, 'POST', {
      projectId: project.id,
      name: versionName,
      description: 'Sample release created by Accord. Safe to delete.',
    }),
    'create the sample release version',
  );

  const item = (summary: string, inRelease: boolean, assign: boolean) => ({
    fields: {
      project: { id: project.id },
      issuetype: { id: issueType.id },
      summary: `${summary} (Accord sample)`,
      labels: [LABEL],
      ...(inRelease ? { fixVersions: [{ id: version.id }] } : {}),
      ...(assign ? { assignee: { accountId: me.accountId } } : {}),
    },
  });
  const created = await ok(
    await jira(route`/rest/api/3/issue/bulk`, 'POST', {
      issueUpdates: [
        item('Release review', false, true),
        item('Token rotation regression suite', false, true),
        item('Refresh-token session flow', true, true),
        item('Versioned API response schema', true, true),
        item('Canary rollout and rollback', true, false),
      ],
    }),
    'create sample work items',
  );
  const keys = (created.issues ?? []).map((issue: any) => String(issue.key));
  if (keys.length !== 5) throw new Error('Jira did not create every sample work item.');
  const [anchor, tests, session, api_, rollout] = keys;
  for (const key of [session, api_])
    if (!(await transitionToDone(key)))
      warnings.push(`${key} could not be moved to Done automatically; move it manually.`);

  const space = await ok(
    await confluence(route`/wiki/api/v2/spaces?keys=${spaceKey}`),
    'read the space',
  );
  const spaceId = space.results?.[0]?.id;
  if (!spaceId) throw new Error('The selected Confluence space is not visible to you.');
  const createPage = async (title: string, paragraphs: string[]) =>
    ok(
      await confluence(route`/wiki/api/v2/pages`, 'POST', {
        spaceId,
        status: 'current',
        title: `${title} (Accord sample ${stamp})`,
        body: { representation: 'storage', value: storage(paragraphs) },
      }),
      'create a sample decision page',
    );
  const security = await createPage(
    'Session security and token rotation',
    securityPage({ session, tests }, 1),
  );
  const playbook = await createPage('Progressive delivery playbook', rolloutPage({ rollout }));

  const securityText = storageToText(storage(securityPage({ session, tests }, 1)));
  await saveConfirmation(
    String(security.id),
    1,
    confirmedContract(
      {
        title: 'Session security and token rotation',
        owner: 'Security team',
        appliesTo: [session],
        rules: [
          {
            id: 'rotation-policy',
            kind: 'stated',
            summary: 'Refresh tokens rotate every 24 hours.',
            quote: 'Decision: Refresh tokens rotate every 24 hours.',
          },
          {
            id: 'rotation-tests',
            kind: 'requires_done',
            issueKey: tests,
            summary: 'The rotation regression suite must be Done before the session flow ships.',
            quote: `${session} must not ship until the rotation regression suite ${tests} is Done.`,
          },
        ],
      },
      securityText,
    ),
  );
  await saveConfirmation(
    String(playbook.id),
    1,
    confirmedContract(
      {
        title: 'Progressive delivery playbook',
        owner: 'Release engineering',
        appliesTo: [rollout],
        rules: [
          {
            id: 'rollout-owner',
            kind: 'requires_owner',
            summary: 'Every rollout needs a named owner.',
            quote: 'Every canary rollout needs a named owner for the rollout and rollback window.',
          },
        ],
      },
      storageToText(storage(rolloutPage({ rollout }))),
    ),
  );

  const target = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await configure({
    project: projectKey,
    version: versionName,
    anchorIssue: anchor,
    targetDate: target,
    pageIds: [String(security.id), String(playbook.id)],
  });

  // The decision moves on after review: this is the drift Accord should catch.
  await ok(
    await confluence(route`/wiki/api/v2/pages/${security.id}`, 'PUT', {
      id: String(security.id),
      status: 'current',
      title: security.title,
      body: { representation: 'storage', value: storage(securityPage({ session, tests }, 2)) },
      version: { number: 2, message: 'Updated after the penetration test review' },
    }),
    'publish the sample decision update',
  );

  return {
    anchorIssue: anchor,
    version: versionName,
    issues: keys,
    pages: [String(security.id), String(playbook.id)],
    warnings,
  };
}
