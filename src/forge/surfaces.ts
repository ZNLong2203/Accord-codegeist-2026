import api, { route } from '@forge/api';
import { z } from 'zod';
import { issueContext, pageStatus, type WorkItemSummary } from '../domain/context';
import { issueKey } from '../domain/schema';
import { storageToText } from '../domain/text';
import { readConfirmations } from './commitments';
import { escapeJql, getPage, legacyContract, loadSnapshot } from './service';

/** Jira search aliases declared by the jira:entityProperty module in the manifest. */
export const reviewProjectAlias = 'accordReviewProject';
export const reviewVersionAlias = 'accordReviewVersion';

async function siteUrl(): Promise<string> {
  const response = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  if (!response.ok) return '';
  return String((await response.json()).baseUrl ?? '');
}

async function workItems(keys: string[], base: string): Promise<WorkItemSummary[]> {
  const unique = [...new Set(keys)].filter((key) => issueKey.safeParse(key).success).slice(0, 50);
  if (!unique.length) return [];
  const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: `key in (${unique.join(',')})`,
      maxResults: 50,
      fields: ['summary', 'status'],
    }),
  });
  // Keys the caller cannot see are simply absent; nothing about them is returned.
  if (!response.ok) return [];
  const body = await response.json();
  return (body.issues ?? []).map((raw: any) => ({
    key: String(raw.key),
    summary: String(raw.fields?.summary ?? ''),
    status: String(raw.fields?.status?.name ?? 'Unknown'),
    done: raw.fields?.status?.statusCategory?.key === 'done',
    url: base ? `${base}/browse/${raw.key}` : '',
  }));
}

/** Confluence byline: the page's confirmed commitments and the Jira work built on them. */
export async function getPageStatus(input: unknown) {
  const { pageId } = z.object({ pageId: z.string().regex(/^\d+$/).max(40) }).parse(input);
  const page = await getPage(pageId);
  const currentVersion = z.number().int().positive().parse(page.version?.number);
  const currentText = storageToText(page.body?.storage?.value ?? '');
  const stored = await readConfirmations(pageId);
  const latest = stored?.confirmations.at(-1) ?? null;
  const legacy = latest ? null : legacyContract(page.body?.storage?.value ?? '');
  const contract = latest?.contract ?? legacy;
  const confirmedVersion = latest?.pageVersion ?? (legacy ? currentVersion : null);
  let confirmedText: string | null = null;
  if (latest && latest.pageVersion !== currentVersion) {
    try {
      confirmedText = storageToText(
        (await getPage(pageId, latest.pageVersion)).body?.storage?.value ?? '',
      );
    } catch {
      confirmedText = null;
    }
  } else if (contract) confirmedText = currentText;
  const keys = contract
    ? [
        ...contract.appliesTo,
        ...contract.rules.flatMap((rule) => (rule.kind === 'requires_done' ? [rule.issueKey] : [])),
      ]
    : [];
  return pageStatus({
    pageId,
    title: String(page.title ?? ''),
    currentVersion,
    confirmedVersion,
    contract,
    confirmedText,
    currentText,
    issues: await workItems(keys, await siteUrl()),
  });
}

/** Jira issue context: the reviews that include this work item and what it was built on. */
export async function getIssueContext(input: unknown) {
  const { issueKey: key } = z.object({ issueKey }).parse(input);
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${key}?fields=fixVersions,project`);
  if (!response.ok) throw new Error(`Jira returned HTTP ${response.status} for ${key}.`);
  const issue = await response.json();
  const project = String(issue.fields?.project?.key ?? '');
  const versions: string[] = (issue.fields?.fixVersions ?? [])
    .map((version: any) => String(version.name ?? ''))
    .filter(Boolean)
    .slice(0, 10);
  if (!project || !versions.length) return { reviews: [], reason: 'no-release' as const };
  const jql = `${reviewProjectAlias} = "${escapeJql(project)}" AND ${reviewVersionAlias} in (${versions
    .map((name) => `"${escapeJql(name)}"`)
    .join(', ')}) ORDER BY updated DESC`;
  const search = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, maxResults: 3, fields: ['summary'] }),
  });
  if (!search.ok) return { reviews: [], reason: 'search-unavailable' as const };
  const anchors: string[] = ((await search.json()).issues ?? []).map((raw: any) => raw.key);
  const base = await siteUrl();
  const reviews = [];
  for (const anchor of anchors) {
    try {
      reviews.push(issueContext(await loadSnapshot(anchor, base), key));
    } catch {
      // A review the caller cannot fully read is skipped rather than partially shown.
    }
  }
  return { reviews, reason: reviews.length ? null : ('no-review' as const) };
}
