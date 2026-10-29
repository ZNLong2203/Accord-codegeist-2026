import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSnapshot } from '../src/domain/demo';

const mocks = vi.hoisted(() => ({ jira: vi.fn(), confluence: vi.fn(), asApp: vi.fn() }));
vi.mock('@forge/api', () => ({
  default: {
    asUser: () => ({ requestJira: mocks.jira, requestConfluence: mocks.confluence }),
    asApp: mocks.asApp,
  },
  route: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (value, part, i) =>
        value + part + (i < values.length ? encodeURIComponent(String(values[i])) : ''),
      '',
    ),
}));
import { adoptBaseline, configure, loadSnapshot, recordDecision } from '../src/forge/service';
import { commentRecord, loadHistory, reviewPropertyKey } from '../src/forge/history';
import { snapshotToken } from '../src/domain/engine';

const config = {
  project: 'PLAT',
  version: '2.8',
  anchorIssue: 'PLAT-150',
  targetDate: '2026-11-06',
  pageIds: ['1001'],
};
const contract = createDemoSnapshot().decisions[0].contract;
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const page = (version: number, rationale = contract.rationale) => ({
  id: '1001',
  spaceId: '42',
  title: 'Security decision',
  version: { number: version, createdAt: '2026-10-29T09:00:00Z' },
  body: {
    storage: {
      value: `<ac:plain-text-body><![CDATA[${JSON.stringify({ ...contract, rationale })}]]></ac:plain-text-body>`,
    },
  },
});
const rawIssue = (key: string, category = 'done') => ({
  key,
  fields: {
    summary: key,
    status: {
      name: category === 'done' ? 'Done' : 'In progress',
      statusCategory: { key: category },
    },
    updated: '2026-10-29T09:00:00Z',
    labels: [],
    assignee: { displayName: 'Reviewer' },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.jira.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') return response({}, 204);
    if (path.includes('/properties/'))
      return response({
        value: { configuration: config, baselines: [{ pageId: '1001', version: 3 }] },
      });
    if (path.includes('/search/jql')) return response({ issues: [rawIssue('PLAT-142')] });
    if (path.includes('/PLAT-139')) return response(rawIssue('PLAT-139', 'indeterminate'));
    if (path.includes('/comment?')) return response({ comments: [], total: 0 });
    if (path.includes('/comment'))
      return response(
        { id: '100', created: '2026-10-29T10:00:00Z', author: { displayName: 'Current user' } },
        201,
      );
    throw new Error(`Unexpected path ${path}`);
  });
  mocks.confluence.mockImplementation(async (path: string) =>
    response(path.includes('version=3') ? page(3) : page(4, 'Changed rationale')),
  );
});

describe('permission-aware Forge adapter', () => {
  it('stores only source IDs and versions, never copies Confluence content into Jira properties', async () => {
    await configure(config);
    const call = mocks.jira.mock.calls.find(([, options]) => options?.method === 'PUT');
    const stored = JSON.parse(call?.[1].body);
    expect(stored.baselines).toEqual([{ pageId: '1001', version: 4 }]);
    expect(JSON.stringify(stored)).not.toContain(contract.rationale);
    expect(mocks.asApp).not.toHaveBeenCalled();
  });

  it('re-reads historical and current source content as the current user', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    expect(snapshot.decisions[0].reviewedVersion).toBe(3);
    expect(snapshot.decisions[0].currentVersion).toBe(4);
    expect(snapshot.decisions[0].currentExcerpt).toBe('Changed rationale');
    expect(mocks.confluence.mock.calls.some(([path]) => path.includes('version=3'))).toBe(true);
    expect(snapshot.issues.find((i) => i.key === 'PLAT-139')?.inScope).toBe(false);
    expect(mocks.asApp).not.toHaveBeenCalled();
  });

  it('removes source content if the user can no longer read the page', async () => {
    mocks.confluence.mockResolvedValue(response({ privateTitle: 'Do not leak' }, 403));
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    expect(snapshot.coverage.complete).toBe(false);
    expect(snapshot.decisions[0].accessible).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain(contract.rationale);
    expect(JSON.stringify(snapshot)).not.toContain('Do not leak');
  });

  it('rejects a stale review without posting a Jira comment', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    mocks.confluence.mockImplementation(async (path: string) =>
      response(path.includes('version=3') ? page(3) : page(5)),
    );
    await expect(
      recordDecision(
        'PLAT-150',
        {
          requestId: 'cc8c339a-21af-4b02-9405-18c7c0b2c89f',
          outcome: 'hold',
          rationale: 'We need to revisit the changed source.',
          snapshotToken: snapshotToken(snapshot),
        },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('evidence changed');
    expect(
      mocks.jira.mock.calls.filter(
        ([path, options]) => path.includes('/comment') && options?.method === 'POST',
      ),
    ).toHaveLength(0);
  });

  it('records exactly one explicit review comment when evidence still matches', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    const result = await recordDecision(
      'PLAT-150',
      {
        requestId: 'cc8c339a-21af-4b02-9405-18c7c0b2c89f',
        outcome: 'hold',
        rationale: 'We need to revisit the changed source.',
        snapshotToken: snapshotToken(snapshot),
      },
      'https://demo.atlassian.net',
    );
    expect(result.actor).toBe('Current user');
    const comments = mocks.jira.mock.calls.filter(
      ([path, options]) => path.includes('/comment') && options?.method === 'POST',
    );
    expect(comments).toHaveLength(1);
    expect(comments[0][1].method).toBe('POST');
    expect(comments[0][1].body).toContain('Decision: HOLD');
    expect(comments[0][1].body).not.toContain('Changed rationale');
  });

  it('encodes blank lines in a rationale as valid empty ADF paragraphs', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    await recordDecision(
      'PLAT-150',
      {
        requestId: '340b17f9-5ef8-448d-9276-b21af3f95471',
        outcome: 'hold',
        rationale: 'We will hold this release.\n\nMaya owns the next review.',
        snapshotToken: snapshotToken(snapshot),
      },
      'https://demo.atlassian.net',
    );
    const call = mocks.jira.mock.calls.find(
      ([path, options]) => path.endsWith('/comment') && options?.method === 'POST',
    );
    const paragraphs = JSON.parse(call?.[1].body).body.content;
    expect(paragraphs.some((paragraph: any) => paragraph.content.length === 0)).toBe(true);
    expect(
      paragraphs.some((paragraph: any) =>
        paragraph.content.some((node: any) => node.type === 'text' && node.text === ''),
      ),
    ).toBe(false);
  });

  it('bounds pagination and marks truncated evidence unknown', async () => {
    const original = mocks.jira.getMockImplementation()!;
    mocks.jira.mockImplementation(async (path: string, options: any) =>
      path.includes('/search/jql')
        ? response({ issues: [rawIssue('PLAT-142')], nextPageToken: 'more' })
        : original(path, options),
    );
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    expect(mocks.jira.mock.calls.filter(([path]) => path.includes('/search/jql'))).toHaveLength(5);
    expect(snapshot.coverage.complete).toBe(false);
    expect(snapshot.coverage.warnings.join()).toContain('500-item');
  });
});

describe('shared history and retry recovery', () => {
  const requestId = 'cc8c339a-21af-4b02-9405-18c7c0b2c89f';
  const metadata = {
    schemaVersion: 1,
    requestId,
    outcome: 'hold' as const,
    rationale: 'We need to revisit the changed source.',
    snapshotId: 'AC-EXAMPLE',
    findingCount: 2,
  };
  const comment = {
    id: '201',
    created: '2026-10-29T10:00:00Z',
    author: { displayName: 'Second reviewer' },
    properties: [{ key: reviewPropertyKey, value: metadata }],
  };
  const nativeComment = (rationale: string) => ({
    ...comment,
    properties: [
      {
        key: reviewPropertyKey,
        value: {
          schemaVersion: 2,
          requestId,
          outcome: 'hold',
          snapshotId: metadata.snapshotId,
          findingCount: 2,
          rationaleLineCount: rationale.split('\n').length,
        },
      },
    ],
    body: {
      type: 'doc',
      version: 1,
      content: [
        'Accord release review · Platform 2.8',
        'Decision: HOLD',
        ...`Rationale: ${rationale}`.split('\n'),
        `Snapshot: ${metadata.snapshotId} · observed 2026-10-29T10:00:00Z`,
      ].map((text) => ({
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      })),
    },
  });

  it('recovers multiline rationale from the native comment without property copies', async () => {
    const rationale = 'Hold for the source owner.\n\nSnapshot: this line belongs to the rationale.';
    const stored = nativeComment(rationale);
    const record = commentRecord(stored, 'PLAT-150', 'https://demo.atlassian.net');
    expect(record?.rationale).toBe(rationale);
    expect(record?.actor).toBe('Second reviewer');
    expect(JSON.stringify(stored.properties)).not.toContain(rationale);
    mocks.jira.mockResolvedValue(response({ comments: [stored], total: 1 }));
    const recovered = await recordDecision(
      'PLAT-150',
      { requestId, outcome: 'hold', rationale, snapshotToken: 'old snapshot' },
      'https://demo.atlassian.net',
    );
    expect(recovered.rationale).toBe(rationale);
    expect(mocks.confluence).not.toHaveBeenCalled();
    expect(mocks.jira.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it.each(['missing body', 'edited outcome'])(
    'fails closed on a retry when its native comment has %s',
    async (kind) => {
      const stored: any = nativeComment(metadata.rationale);
      if (kind === 'missing body') delete stored.body;
      else stored.body.content[1].content[0].text = 'Decision: PROCEED WITH CONDITIONS';
      mocks.jira.mockResolvedValue(response({ comments: [stored], total: 1 }));
      await expect(
        recordDecision(
          'PLAT-150',
          { requestId, outcome: 'hold', rationale: metadata.rationale, snapshotToken: 'old' },
          'https://demo.atlassian.net',
        ),
      ).rejects.toThrow('edited or is incomplete');
      expect(mocks.jira.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    },
  );

  it('loads visible Accord comments and follows underlying Jira comment pagination', async () => {
    mocks.jira.mockImplementation(async (path: string) =>
      path.includes('/comment/202/properties/')
        ? response({}, 404)
        : response({ comments: [comment, { id: '202', body: {} }], total: 3 }),
    );
    const result = await loadHistory('PLAT-150', 'https://demo.atlassian.net');
    expect(result.records).toHaveLength(1);
    expect(result.records[0].actor).toBe('Second reviewer');
    expect(result.nextStartAt).toBe(2);
    expect(mocks.jira.mock.calls[0][0]).toContain('maxResults=20');
  });

  it('recovers an already accepted retry without another POST, even after evidence changes', async () => {
    mocks.jira.mockResolvedValue(response({ comments: [comment], total: 1 }));
    const item = await recordDecision(
      'PLAT-150',
      {
        requestId,
        outcome: metadata.outcome,
        rationale: metadata.rationale,
        snapshotToken: 'old snapshot',
      },
      'https://demo.atlassian.net',
    );
    expect(item.id).toBe('201');
    expect(mocks.confluence).not.toHaveBeenCalled();
    expect(mocks.jira.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('rejects reusing a request identifier for a different decision', async () => {
    mocks.jira.mockResolvedValue(response({ comments: [comment], total: 1 }));
    await expect(
      recordDecision(
        'PLAT-150',
        {
          requestId,
          outcome: 'proceed_with_conditions',
          rationale: metadata.rationale,
          snapshotToken: 'old snapshot',
        },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('different content');
  });

  it('does not post if retry history cannot be read', async () => {
    mocks.jira.mockResolvedValue(response({}, 403));
    await expect(
      recordDecision(
        'PLAT-150',
        { requestId, outcome: 'hold', rationale: metadata.rationale, snapshotToken: 'snapshot' },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('history');
    expect(mocks.jira.mock.calls).toHaveLength(1);
  });

  it('writes metadata with the comment so future readers can load its history', async () => {
    const original = mocks.jira.getMockImplementation()!;
    mocks.jira.mockImplementation(async (path: string, options: any) =>
      path.includes('/comment?') ? response({ comments: [], total: 0 }) : original(path, options),
    );
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    await recordDecision(
      'PLAT-150',
      {
        requestId,
        outcome: 'hold',
        rationale: metadata.rationale,
        snapshotToken: snapshotToken(snapshot),
      },
      'https://demo.atlassian.net',
    );
    const post = mocks.jira.mock.calls.find(
      ([path, options]) => path.endsWith('/comment') && options?.method === 'POST',
    );
    const value = JSON.parse(post?.[1].body).properties[0].value;
    expect(value).toMatchObject({ schemaVersion: 2, requestId, rationaleLineCount: 1 });
    expect(value).not.toHaveProperty('rationale');
    expect(JSON.stringify(value)).not.toContain(metadata.rationale);
  });

  it('reads comment properties through the dedicated endpoint when omitted from the list', async () => {
    mocks.jira.mockImplementation(async (path: string) =>
      path.includes('/comment/201/properties/')
        ? response({ key: reviewPropertyKey, value: metadata })
        : response({ comments: [{ ...comment, properties: undefined }], total: 1 }),
    );
    const history = await loadHistory('PLAT-150', 'https://demo.atlassian.net');
    expect(history.records[0].requestId).toBe(requestId);
    expect(mocks.jira).toHaveBeenCalledTimes(2);
  });

  it('does not treat malformed history as proof that a retry has not been recorded', async () => {
    mocks.jira.mockResolvedValue(response({ unexpected: 'payload' }));
    await expect(
      recordDecision(
        'PLAT-150',
        { requestId, outcome: 'hold', rationale: metadata.rationale, snapshotToken: 'snapshot' },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow();
    expect(mocks.jira.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('stops a retry lookup at its bound without creating a new comment', async () => {
    mocks.jira.mockResolvedValue(
      response({
        comments: Array.from({ length: 20 }, (_, index) => ({
          ...comment,
          id: String(1000 + index),
        })),
        total: 1000,
      }),
    );
    await expect(
      recordDecision(
        'PLAT-150',
        {
          requestId: '289eb77a-6a14-4f7b-9d29-45f919fb6551',
          outcome: 'hold',
          rationale: metadata.rationale,
          snapshotToken: 'snapshot',
        },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('100-comment bound');
    expect(mocks.jira).toHaveBeenCalledTimes(5);
  });
});

describe('reviewing one changed baseline', () => {
  it('drops copied reviewer IDs from legacy adoption entries when updating the baseline', async () => {
    const original = mocks.jira.getMockImplementation()!;
    mocks.jira.mockImplementation(async (path: string, options: any) => {
      if (path.endsWith('/properties/accord.configuration.v1') && !options?.method)
        return response({
          value: {
            configuration: config,
            baselines: [{ pageId: '1001', version: 3 }],
            reviews: [
              {
                pageId: '1001',
                fromVersion: 2,
                toVersion: 3,
                reviewedAt: '2026-10-28T10:00:00Z',
                reviewerId: 'legacy-personal-account',
              },
            ],
          },
        });
      return original(path, options);
    });
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    await adoptBaseline(
      'PLAT-150',
      { pageId: '1001', snapshotToken: snapshotToken(snapshot) },
      'https://demo.atlassian.net',
    );
    const put = mocks.jira.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(put?.[1].body).reviews).toHaveLength(2);
    expect(put?.[1].body).not.toContain('reviewerId');
    expect(put?.[1].body).not.toContain('legacy-personal-account');
  });
  it('stores version metadata without source excerpts or copied user identifiers', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    await adoptBaseline(
      'PLAT-150',
      { pageId: '1001', snapshotToken: snapshotToken(snapshot) },
      'https://demo.atlassian.net',
    );
    const put = mocks.jira.mock.calls.find(([, options]) => options?.method === 'PUT');
    const value = JSON.parse(put?.[1].body);
    expect(value.baselines[0].version).toBe(4);
    expect(value.reviews[0]).toMatchObject({
      pageId: '1001',
      fromVersion: 3,
      toVersion: 4,
    });
    expect(value.reviews[0]).not.toHaveProperty('reviewerId');
    expect(put?.[1].body).not.toContain('Changed rationale');
  });

  it('blocks adoption when the page changes while the review is open', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    mocks.confluence.mockImplementation(async (path: string) =>
      response(path.includes('version=3') ? page(3) : page(5)),
    );
    await expect(
      adoptBaseline(
        'PLAT-150',
        { pageId: '1001', snapshotToken: snapshotToken(snapshot) },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('evidence changed');
    expect(mocks.jira.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
  });
});
