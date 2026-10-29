import api, { route } from '@forge/api';
import { z } from 'zod';
import { issueKey, type DecisionRecord, type HistoryPage } from '../domain/schema';

export const reviewPropertyKey = 'accord.review.v1';
export const reviewMetadata = z.object({
  schemaVersion: z.literal(1),
  outcome: z.enum(['hold', 'proceed_with_conditions']),
  rationale: z.string().min(20).max(2000),
  snapshotId: z.string().max(80),
  findingCount: z.number().int().nonnegative().max(1000),
  requestId: z.uuid(),
});

export function commentRecord(
  comment: any,
  anchor: string,
  siteUrl: string,
): DecisionRecord | null {
  const metadata = reviewMetadata.safeParse(
    (Array.isArray(comment.properties) ? comment.properties : []).find(
      (property: any) => property.key === reviewPropertyKey,
    )?.value,
  );
  if (!metadata.success || !comment.id || !comment.created) return null;
  return {
    id: String(comment.id),
    ...metadata.data,
    actor: String(comment.author?.displayName ?? 'Jira reviewer'),
    recordedAt: String(comment.created),
    url: `${siteUrl}/browse/${anchor}?focusedCommentId=${comment.id}`,
  };
}

/** Pagination follows all visible comments, including pages without Accord records. */
export async function loadHistory(
  anchor: string,
  siteUrl: string,
  startAt = 0,
): Promise<HistoryPage> {
  issueKey.parse(anchor);
  z.number().int().min(0).max(100000).parse(startAt);
  const response = await api
    .asUser()
    .requestJira(
      route`/rest/api/3/issue/${anchor}/comment?startAt=${startAt}&maxResults=20&orderBy=-created`,
    );
  if (!response.ok) throw new Error(`Could not read review history (HTTP ${response.status}).`);
  const page = z
    .object({
      comments: z.array(z.record(z.string(), z.unknown())),
      total: z.number().int().nonnegative(),
    })
    .parse(await response.json());
  const comments = page.comments;
  // Jira documents renderedBody expansion, not property expansion. Read metadata
  // through its own permission-aware endpoint when it was not returned inline.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, comments.length) }, async () => {
      while (cursor < comments.length) {
        const comment = comments[cursor++];
        if (
          Array.isArray(comment.properties) &&
          comment.properties.some((p: any) => p.key === reviewPropertyKey)
        )
          continue;
        const id = z.string().regex(/^\d+$/).parse(String(comment.id));
        const metadataResponse = await api
          .asUser()
          .requestJira(route`/rest/api/3/comment/${id}/properties/${reviewPropertyKey}`);
        if (metadataResponse.status === 404) continue;
        if (!metadataResponse.ok)
          throw new Error(`Could not read review metadata (HTTP ${metadataResponse.status}).`);
        const property = z
          .object({ key: z.literal(reviewPropertyKey), value: z.unknown() })
          .parse(await metadataResponse.json());
        comment.properties = [property];
      }
    }),
  );
  return {
    records: comments
      .map((comment: any) => commentRecord(comment, anchor, siteUrl))
      .filter((record: DecisionRecord | null): record is DecisionRecord => record !== null),
    nextStartAt:
      comments.length > 0 && startAt + comments.length < (page.total ?? 0)
        ? startAt + comments.length
        : null,
  };
}

/** Recover an acknowledged retry from the most recent 100 visible comments. */
export async function findRecordedRequest(
  anchor: string,
  siteUrl: string,
  requestId: string,
): Promise<DecisionRecord | null> {
  let startAt = 0;
  for (let index = 0; index < 5; index++) {
    const page = await loadHistory(anchor, siteUrl, startAt);
    const existing = page.records.find((record) => record.requestId === requestId);
    if (existing) return existing;
    if (page.nextStartAt === null) return null;
    startAt = page.nextStartAt;
  }
  throw new Error(
    'The retry lookup reached its 100-comment bound. Check Jira history before submitting again.',
  );
}
