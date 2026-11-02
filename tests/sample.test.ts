import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ jira: vi.fn(), confluence: vi.fn(), asApp: vi.fn() }));
vi.mock('@forge/llm', () => ({ chat: vi.fn(), list: vi.fn() }));
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
import { createSampleRelease } from '../src/forge/sample';
import { loadSnapshot } from '../src/forge/service';
import { assess, findSmallestSafeScope } from '../src/domain/engine';

const reply = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
});

/** A tiny in-memory Jira + Confluence that honours the calls the seeder makes. */
function fakeSite(options: { doneTransition?: boolean } = {}) {
  const issues = new Map<string, any>();
  const properties = new Map<string, any>();
  const pages = new Map<string, { title: string; versions: string[]; property?: any }>();
  let version: any;
  mocks.jira.mockImplementation(async (path: string, init?: any) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (path === '/rest/api/3/project/DEMO')
      return reply({ id: '10', issueTypes: [{ id: '3', name: 'Task', subtask: false }] });
    if (path === '/rest/api/3/myself') return reply({ accountId: 'me' });
    if (path === '/rest/api/3/serverInfo') return reply({ baseUrl: 'https://site.test' });
    if (path === '/rest/api/3/version' && method === 'POST') {
      version = { id: '77', name: body.name };
      return reply(version, 201);
    }
    if (path === '/rest/api/3/issue/bulk') {
      const created = body.issueUpdates.map((update: any, i: number) => {
        const key = `DEMO-${i + 1}`;
        issues.set(key, {
          key,
          fields: {
            summary: update.fields.summary,
            status: { name: 'To Do', statusCategory: { key: 'new' } },
            assignee: update.fields.assignee ? { displayName: 'Judge' } : null,
            labels: update.fields.labels,
            updated: '2026-11-02T00:00:00Z',
            fixVersions: update.fields.fixVersions ?? [],
          },
        });
        return { key };
      });
      return reply({ issues: created }, 201);
    }
    const transition = path.match(/^\/rest\/api\/3\/issue\/(DEMO-\d+)\/transitions$/);
    if (transition) {
      if (method === 'GET')
        return reply({
          transitions:
            options.doneTransition === false
              ? []
              : [{ id: '31', to: { statusCategory: { key: 'done' } } }],
        });
      issues.get(transition[1]).fields.status = { name: 'Done', statusCategory: { key: 'done' } };
      return reply({}, 204);
    }
    const property = path.match(/^\/rest\/api\/3\/issue\/(DEMO-\d+)\/properties\/(.+)$/);
    if (property) {
      if (method === 'PUT') {
        properties.set(property[1], body);
        return reply({}, 200);
      }
      return properties.has(property[1])
        ? reply({ value: properties.get(property[1]) })
        : reply({}, 404);
    }
    if (path === '/rest/api/3/search/jql')
      return reply({
        issues: [...issues.values()].filter((issue) =>
          issue.fields.fixVersions.some((v: any) => v.id === version.id),
        ),
      });
    const single = path.match(/^\/rest\/api\/3\/issue\/(DEMO-\d+)\?/);
    if (single) return reply(issues.get(single[1]));
    throw new Error(`Unexpected Jira call ${method} ${path}`);
  });
  mocks.confluence.mockImplementation(async (path: string, init?: any) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (path.startsWith('/wiki/api/v2/spaces?keys=')) return reply({ results: [{ id: '500' }] });
    if (path === '/wiki/api/v2/pages' && method === 'POST') {
      const id = String(9000 + pages.size);
      pages.set(id, { title: body.title, versions: [body.body.value] });
      return reply({ id, title: body.title, version: { number: 1 } });
    }
    const props = path.match(/^\/wiki\/api\/v2\/pages\/(\d+)\/properties/);
    if (props) {
      const page = pages.get(props[1])!;
      if (method === 'GET') return reply({ results: page.property ? [page.property] : [] });
      page.property = { id: 'p1', version: { number: 1 }, ...body };
      return reply(page.property);
    }
    const one = path.match(/^\/wiki\/api\/v2\/pages\/(\d+)(?:\?(.*))?$/);
    if (one) {
      const page = pages.get(one[1])!;
      if (method === 'PUT') {
        expect(body.version.number).toBe(page.versions.length + 1);
        page.versions.push(body.body.value);
        return reply({ id: one[1] });
      }
      const requested = Number(new URLSearchParams(one[2]).get('version') ?? page.versions.length);
      return reply({
        id: one[1],
        spaceId: '500',
        title: page.title,
        version: { number: requested, createdAt: '2026-11-02T00:00:00Z' },
        body: { storage: { value: page.versions[requested - 1] } },
      });
    }
    throw new Error(`Unexpected Confluence call ${method} ${path}`);
  });
  return { issues, pages };
}

beforeEach(() => vi.clearAllMocks());

describe('one-click sample release', () => {
  it('creates real-shaped evidence that Accord reads back as three signals', async () => {
    const site = fakeSite();
    const result = await createSampleRelease({ projectKey: 'DEMO', spaceKey: 'ENG' });
    expect(result).toMatchObject({ anchorIssue: 'DEMO-1', warnings: [] });
    expect([...site.pages.values()].map((page) => page.versions.length)).toEqual([2, 1]);

    const snapshot = await loadSnapshot('DEMO-1', 'https://site.test');
    const assessment = assess(snapshot);
    expect(assessment.findings.map((finding) => finding.kind)).toEqual([
      'commitment_changed',
      'dependency',
      'owner',
    ]);
    expect(assessment.findings[0].title).toBe('DEMO-3 was built on a commitment that changed');
    expect(assessment.findings[0].evidence[1].detail).toContain('rotate on every use');
    expect(findSmallestSafeScope(snapshot)?.excludedKeys).toEqual(['DEMO-3']);
    expect(mocks.asApp).not.toHaveBeenCalled();
  });

  it('reports work it could not move to Done instead of hiding it', async () => {
    fakeSite({ doneTransition: false });
    const result = await createSampleRelease({ projectKey: 'DEMO', spaceKey: 'ENG' });
    expect(result.warnings).toHaveLength(2);
  });

  it('validates the target before touching the site', async () => {
    fakeSite();
    await expect(
      createSampleRelease({ projectKey: 'demo; DROP', spaceKey: 'ENG' }),
    ).rejects.toThrow();
    expect(mocks.jira).not.toHaveBeenCalled();
  });
});
