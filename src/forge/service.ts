import api, { route, type Response } from '@forge/api';
import { z } from 'zod';
import {
  configurationSchema,
  issueKey,
  type Decision,
  type Issue,
  type Snapshot,
  type RecordInput,
} from '../domain/schema';
import { assess, buildDecisionText, snapshotId, snapshotToken } from '../domain/engine';
import { parseContract } from '../domain/contracts';
import { findRecordedRequest, reviewPropertyKey } from './history';

const propertyKey = 'accord.configuration.v1';
const storedSchema = z.object({
  configuration: configurationSchema,
  baselines: z
    .array(
      z.object({
        pageId: z.string().regex(/^\d+$/),
        version: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(10),
  reviews: z
    .array(
      z.object({
        pageId: z.string().regex(/^\d+$/),
        fromVersion: z.number().int(),
        toVersion: z.number().int(),
        reviewedAt: z.string(),
        reviewerId: z.string().max(200),
      }),
    )
    .max(50)
    .optional(),
});
type Stored = z.infer<typeof storedSchema>;

async function jsonResponse(response: Response, source: string): Promise<any> {
  if (!response.ok) {
    // Do not return raw upstream bodies, credentials, or content from inaccessible sources.
    throw new Error(
      `${source} returned HTTP ${response.status}. Check your permissions and app connection.`,
    );
  }
  return response.json();
}

async function getPage(pageId: string, version?: number) {
  const response = await api
    .asUser()
    .requestConfluence(
      version
        ? route`/wiki/api/v2/pages/${pageId}?body-format=storage&version=${version}`
        : route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
    );
  return jsonResponse(response, 'Confluence');
}

async function getStored(anchor: string): Promise<Stored> {
  issueKey.parse(anchor);
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${anchor}/properties/${propertyKey}`);
  if (response.status === 404)
    throw new Error(
      'No Accord setup found on this release issue. Open Settings to connect your decisions.',
    );
  const result = await jsonResponse(response, 'Release configuration');
  return storedSchema.parse(result.value);
}

/** Explicitly adopts the current page versions after human confirmation. */
export async function configure(input: unknown) {
  const configuration = configurationSchema.parse(input);
  if (!configuration.anchorIssue.startsWith(`${configuration.project}-`))
    throw new Error('The review issue must belong to the configured project.');
  const baselines: Stored['baselines'] = [];
  for (const pageId of [...new Set(configuration.pageIds)]) {
    const page = await getPage(pageId);
    parseContract(page.body?.storage?.value ?? '');
    baselines.push({ pageId, version: z.number().int().positive().parse(page.version?.number) });
  }
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${configuration.anchorIssue}/properties/${propertyKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configuration, baselines }),
    });
  if (!response.ok)
    throw new Error(
      `Could not save the review baseline (HTTP ${response.status}). Jira edit permission is required.`,
    );
  return { anchorIssue: configuration.anchorIssue };
}

function mapIssue(raw: any, inScope: boolean, siteUrl: string): Issue {
  const fields = raw.fields ?? {};
  const category = fields.status?.statusCategory?.key;
  return {
    key: issueKey.parse(raw.key),
    summary: String(fields.summary ?? ''),
    status: String(fields.status?.name ?? 'Unknown'),
    statusCategory: category === 'done' ? 'done' : category === 'new' ? 'new' : 'indeterminate',
    assignee: fields.assignee?.displayName ?? null,
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    updated: String(fields.updated ?? ''),
    url: `${siteUrl}/browse/${raw.key}`,
    // Uniform cost avoids guessing a customer's custom story point field.
    effort: 1,
    inScope,
  };
}

function escapeJql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function loadSnapshot(anchor: string, siteUrl: string): Promise<Snapshot> {
  const stored = await getStored(anchor);
  if (!siteUrl) {
    const server = await jsonResponse(
      await api.asUser().requestJira(route`/rest/api/3/serverInfo`),
      'Jira site information',
    );
    siteUrl = z.url().parse(server.baseUrl);
  }
  const { configuration } = stored;
  const decisions: Decision[] = [];
  const warnings: string[] = [];
  for (const baseline of stored.baselines) {
    try {
      const page = await getPage(baseline.pageId);
      const current = parseContract(page.body?.storage?.value ?? '');
      const reviewedPage =
        page.version?.number === baseline.version
          ? page
          : await getPage(baseline.pageId, baseline.version);
      if (reviewedPage.version?.number !== baseline.version)
        throw new Error('Historical version mismatch.');
      const reviewedContract = parseContract(reviewedPage.body?.storage?.value ?? '');
      decisions.push({
        id: baseline.pageId,
        pageId: baseline.pageId,
        title: page.title,
        owner: reviewedContract.owner,
        url: `${siteUrl}/wiki/spaces/${page.spaceId}/pages/${baseline.pageId}`,
        reviewedVersion: baseline.version,
        currentVersion: z.number().int().positive().parse(page.version?.number),
        reviewedExcerpt: reviewedContract.rationale,
        currentExcerpt: current.rationale,
        currentAppliesTo: current.appliesTo,
        currentContract: current,
        updated: page.version?.createdAt ?? '',
        accessible: true,
        contract: reviewedContract,
      });
    } catch {
      // Do not leak baseline content when the caller can no longer read its source.
      warnings.push('A configured decision page is inaccessible or has an invalid contract.');
      decisions.push({
        id: baseline.pageId,
        pageId: baseline.pageId,
        title: 'Unavailable decision',
        owner: 'Unavailable',
        url: '',
        reviewedVersion: 0,
        currentVersion: 0,
        reviewedExcerpt: '',
        currentExcerpt: '',
        updated: '',
        accessible: false,
        contract: {
          schemaVersion: 1,
          title: 'Unavailable',
          owner: 'Unavailable',
          rationale: 'Unavailable',
          appliesTo: ['UNKNOWN-0'],
          rules: [],
        },
      });
    }
  }
  const issues: Issue[] = [];
  let nextPageToken: string | undefined;
  const jql = `project = "${escapeJql(configuration.project)}" AND fixVersion = "${escapeJql(configuration.version)}" ORDER BY key ASC`;
  for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
    const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ['summary', 'status', 'assignee', 'labels', 'updated'],
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    const page = await jsonResponse(response, 'Jira release search');
    for (const raw of page.issues ?? []) {
      const issue = mapIssue(raw, true, siteUrl);
      const duplicate = issues.findIndex((existing) => existing.key === issue.key);
      if (duplicate === -1) issues.push(issue);
      else issues[duplicate] = issue;
    }
    nextPageToken = page.nextPageToken;
    if (!nextPageToken) break;
  }
  if (nextPageToken)
    warnings.push(
      'The release exceeds the 500-item scan limit. Narrow the release to complete the review.',
    );
  const required = new Set(
    decisions
      .filter((d) => d.accessible)
      .flatMap((decision) =>
        decision.contract.rules.flatMap((rule) =>
          rule.kind === 'requires_done' ? [rule.issueKey] : [],
        ),
      ),
  );
  for (const key of required) {
    if (issues.some((issue) => issue.key === key)) continue;
    const response = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${key}?fields=summary,status,assignee,labels,updated`);
    if (response.ok) issues.push(mapIssue(await response.json(), false, siteUrl));
    else warnings.push('A required Jira dependency could not be read.');
  }
  if (!issues.some((issue) => issue.inScope))
    warnings.push(
      'No visible work matched the configured release. Verify the version and Browse Projects access.',
    );
  return {
    mode: 'live',
    capturedAt: new Date().toISOString(),
    release: {
      name: `${configuration.project} ${configuration.version}`,
      project: configuration.project,
      version: configuration.version,
      anchorIssue: configuration.anchorIssue,
      targetDate: configuration.targetDate,
    },
    issues,
    decisions,
    coverage: { complete: warnings.length === 0, warnings },
  };
}

export async function recordDecision(anchor: string, input: RecordInput, siteUrl: string) {
  const validated = z
    .object({
      outcome: z.enum(['hold', 'proceed_with_conditions']),
      rationale: z.string().trim().min(20).max(2000),
      snapshotToken: z.string().max(2_000_000),
      requestId: z.uuid(),
    })
    .strict()
    .parse(input);
  if (validated.requestId) {
    const existing = await findRecordedRequest(anchor, siteUrl, validated.requestId);
    if (existing) {
      if (existing.outcome !== validated.outcome || existing.rationale !== validated.rationale)
        throw new Error(
          'This request was already recorded with different content. Start a new review.',
        );
      return existing;
    }
  }
  const current = await loadSnapshot(anchor, siteUrl);
  if (snapshotToken(current) !== validated.snapshotToken)
    throw new Error(
      'The evidence changed since your review. Refresh and review the new snapshot before recording a decision.',
    );
  if (assess(current).verdict === 'unknown')
    throw new Error('Restore access to incomplete evidence before recording a decision.');
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${anchor}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(validated.requestId
        ? {
            properties: [
              {
                key: reviewPropertyKey,
                value: {
                  schemaVersion: 1,
                  requestId: validated.requestId,
                  outcome: validated.outcome,
                  rationale: validated.rationale,
                  snapshotId: snapshotId(current),
                  findingCount: assess(current).findings.length,
                },
              },
            ],
          }
        : {}),
      body: {
        type: 'doc',
        version: 1,
        content: buildDecisionText(current, validated)
          .split('\n')
          .map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })),
      },
    }),
  });
  const comment = await jsonResponse(response, 'Jira comment');
  return {
    id: comment.id,
    outcome: validated.outcome,
    rationale: validated.rationale,
    actor: comment.author?.displayName ?? 'Current Jira user',
    recordedAt: comment.created,
    snapshotId: snapshotId(current),
    findingCount: assess(current).findings.length,
    url: `${siteUrl}/browse/${anchor}?focusedCommentId=${comment.id}`,
    requestId: validated.requestId,
  };
}

/** Re-review one selected page, preserving other baselines and source permissions. */
export async function adoptBaseline(
  anchor: string,
  input: unknown,
  siteUrl: string,
  reviewerId: string,
) {
  const validated = z
    .object({ pageId: z.string().regex(/^\d+$/), snapshotToken: z.string().max(2_000_000) })
    .strict()
    .parse(input);
  const current = await loadSnapshot(anchor, siteUrl);
  if (snapshotToken(current) !== validated.snapshotToken)
    throw new Error('The evidence changed. Refresh before adopting a baseline.');
  const decision = current.decisions.find((item) => item.pageId === validated.pageId);
  if (!decision?.accessible || !decision.currentContract)
    throw new Error('The current decision source is unavailable.');
  const stored = await getStored(anchor);
  const observedPages = new Set(current.decisions.map((item) => item.pageId));
  if (
    stored.configuration.project !== current.release.project ||
    stored.configuration.version !== current.release.version ||
    stored.configuration.targetDate !== current.release.targetDate ||
    new Set(stored.configuration.pageIds).size !== observedPages.size ||
    stored.configuration.pageIds.some((id) => !observedPages.has(id))
  )
    throw new Error('The release configuration changed. Refresh before reviewing.');
  // Catch a configuration change between the source scan and the write preparation.
  if (
    !stored.baselines.some(
      (b) => b.pageId === decision.pageId && b.version === decision.reviewedVersion,
    )
  )
    throw new Error('The shared baseline changed. Refresh before reviewing.');
  const updated: Stored = {
    ...stored,
    baselines: stored.baselines.map((b) =>
      b.pageId === decision.pageId ? { ...b, version: decision.currentVersion } : b,
    ),
    reviews: [
      ...(stored.reviews ?? []),
      {
        pageId: decision.pageId,
        fromVersion: decision.reviewedVersion,
        toVersion: decision.currentVersion,
        reviewedAt: new Date().toISOString(),
        reviewerId,
      },
    ].slice(-50),
  };
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${anchor}/properties/${propertyKey}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  if (!response.ok)
    throw new Error(
      `Could not adopt the baseline (HTTP ${response.status}). Jira edit permission is required.`,
    );
  return { pageId: decision.pageId, reviewedVersion: decision.currentVersion };
}
