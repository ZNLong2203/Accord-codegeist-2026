import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goalsAtStake, parseGoals, parsePeople } from '../src/domain/graph';

const mocks = vi.hoisted(() => ({ graph: vi.fn(), warn: vi.fn() }));
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestTeamworkGraph: mocks.graph }) },
}));
import { loadGraphContext } from '../src/forge/graph';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const CLOUD = '7f9c2a10-1111-4222-8333-444455556666';

describe('Teamwork Graph parsing', () => {
  it('reads people and goals tolerantly and deduplicates', () => {
    expect(
      parsePeople({
        edges: [
          { node: { __typename: 'AtlassianUser', name: 'Maya', accountId: 'a1' } },
          { node: { __typename: 'AtlassianUser', name: 'Maya', accountId: 'a1' } },
          { node: { displayName: 'Dev', id: 'ari:cloud:identity::user/a2' } },
          { node: { __typename: 'AtlassianUser' } },
          null,
        ],
      }),
    ).toEqual([
      { name: 'Maya', accountId: 'a1' },
      { name: 'Dev', accountId: 'a2' },
    ]);
    expect(
      parseGoals({ edges: [{ node: { name: 'Safer logins', url: 'javascript:x' } }] }),
    ).toEqual([{ name: 'Safer logins' }]);
    expect(parsePeople(null)).toEqual([]);
  });

  it('collects goals at stake only when the graph is available', () => {
    const graph = {
      source: 'teamwork-graph' as const,
      available: true,
      people: {},
      goals: { A: [{ name: 'G1' }], B: [{ name: 'G1' }, { name: 'G2' }] },
    };
    expect(goalsAtStake(graph, ['A', 'B']).map((g) => g.name)).toEqual(['G1', 'G2']);
    expect(goalsAtStake({ ...graph, available: false }, ['A'])).toEqual([]);
  });
});

describe('Teamwork Graph queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(mocks.warn);
  });

  it('queries as the user with page and issue ARIs and falls back on schema errors', async () => {
    mocks.graph.mockImplementation(async (query: string) => {
      if (query.includes('accountId'))
        return ok({
          errors: [{ message: "Cannot query field 'accountId' on type 'AtlassianUser'" }],
        });
      if (query.includes('accord_decisionPeople'))
        return ok({ data: { o0: { edges: [{ node: { name: 'Maya' } }] }, c0: { edges: [] } } });
      return ok({ data: { g0: { edges: [{ node: { name: 'Safer logins' } }] } } });
    });
    const result = await loadGraphContext(
      { pageIds: ['327681'], issues: [{ key: 'ACD-4', id: '10004' }] },
      CLOUD,
    );
    expect(result.available).toBe(true);
    expect(result.people['327681'].owners).toEqual([{ name: 'Maya' }]);
    expect(result.goals['ACD-4']).toEqual([{ name: 'Safer logins' }]);
    const [, variables] = mocks.graph.mock.calls[0];
    expect(variables.p0).toBe(`ari:cloud:confluence:${CLOUD}:page/327681`);
    expect(mocks.graph.mock.calls.at(-1)?.[1].i0).toBe(`ari:cloud:jira:${CLOUD}:issue/10004`);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('Maya');
    for (const call of mocks.graph.mock.calls) expect(call[2]).toMatch(/^[a-z]{3,}_[A-Za-z]{4,}$/);
  });

  it('reports unavailable instead of failing the review', async () => {
    mocks.graph.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const result = await loadGraphContext({ pageIds: ['1'], issues: [] }, CLOUD);
    expect(result).toMatchObject({ available: false, people: {} });
    await expect(loadGraphContext({ pageIds: ['x'], issues: [] }, CLOUD)).rejects.toThrow();
  });
});
