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
import { configure, loadSnapshot, recordDecision } from '../src/forge/service';
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
          outcome: 'hold',
          rationale: 'We need to revisit the changed source.',
          snapshotToken: snapshotToken(snapshot),
        },
        'https://demo.atlassian.net',
      ),
    ).rejects.toThrow('evidence changed');
    expect(mocks.jira.mock.calls.filter(([path]) => path.includes('/comment'))).toHaveLength(0);
  });

  it('records exactly one explicit review comment when evidence still matches', async () => {
    const snapshot = await loadSnapshot('PLAT-150', 'https://demo.atlassian.net');
    const result = await recordDecision(
      'PLAT-150',
      {
        outcome: 'hold',
        rationale: 'We need to revisit the changed source.',
        snapshotToken: snapshotToken(snapshot),
      },
      'https://demo.atlassian.net',
    );
    expect(result.actor).toBe('Current user');
    const comments = mocks.jira.mock.calls.filter(([path]) => path.includes('/comment'));
    expect(comments).toHaveLength(1);
    expect(comments[0][1].method).toBe('POST');
    expect(comments[0][1].body).toContain('Decision: HOLD');
    expect(comments[0][1].body).not.toContain('Changed rationale');
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
