import api from '@forge/api';
import { z } from 'zod';
import { parseGoals, parsePeople, type GraphContext } from '../domain/graph';

/**
 * Teamwork Graph curated queries, called as the user so results follow their
 * permissions. The API is in Preview and its documentation is inconsistent about
 * field names, so selections are tried in order and the first that validates is
 * kept for the life of the function container.
 */
const USER_SELECTIONS = ['name accountId', 'name', 'displayName'];
const GOAL_SELECTIONS = ['name url', 'name', 'displayName'];
const chosen: { user?: string; goal?: string } = {};

type GraphResult = {
  data?: Record<string, unknown>;
  errors?: { message?: string; extensions?: { code?: string } }[];
};

async function request(query: string, variables: Record<string, unknown>): Promise<GraphResult> {
  const response = await api.asUser().requestTeamworkGraph(query, variables);
  if (!response.ok) return { errors: [{ message: `HTTP ${response.status}` }] };
  return (await response.json()) as GraphResult;
}

function isValidationError(result: GraphResult): boolean {
  return Boolean(
    result.errors?.some((error) =>
      /cannot query field|undefined field|validation|unknown type|fieldundefined/i.test(
        `${error.message ?? ''} ${error.extensions?.code ?? ''}`,
      ),
    ),
  );
}

/** Operational diagnostics only: error codes and schema messages, never user content. */
function warn(what: string, result: GraphResult) {
  console.warn(
    `Teamwork Graph ${what}:`,
    JSON.stringify(
      (result.errors ?? []).slice(0, 3).map((error) => ({
        code: error.extensions?.code,
        message: String(error.message ?? '').slice(0, 200),
      })),
    ),
  );
}

async function withSelection(
  kind: 'user' | 'goal',
  build: (selection: string) => string,
  variables: Record<string, unknown>,
): Promise<GraphResult | null> {
  const options = chosen[kind]
    ? [chosen[kind]!]
    : kind === 'user'
      ? USER_SELECTIONS
      : GOAL_SELECTIONS;
  for (const selection of options) {
    const result = await request(build(selection), variables);
    if (isValidationError(result)) {
      warn(`${kind} selection "${selection}" rejected`, result);
      continue;
    }
    chosen[kind] = selection;
    if (result.errors?.length) warn(`${kind} query`, result);
    return result;
  }
  return null;
}

export const graphInput = z
  .object({
    pageIds: z.array(z.string().regex(/^\d+$/).max(40)).max(10),
    issues: z
      .array(z.object({ key: z.string().max(80), id: z.string().regex(/^\d+$/).max(40) }))
      .max(15),
  })
  .strict();

export async function loadGraphContext(input: unknown, cloudId: string): Promise<GraphContext> {
  const { pageIds, issues } = graphInput.parse(input);
  const empty: GraphContext = { source: 'teamwork-graph', available: false, people: {}, goals: {} };
  if (!/^[0-9a-f-]{36}$/i.test(cloudId)) return { ...empty, note: 'Site ID unavailable.' };

  const context: GraphContext = { ...empty, available: true };
  if (pageIds.length) {
    const variables = Object.fromEntries(
      pageIds.map((id, i) => [`p${i}`, `ari:cloud:confluence:${cloudId}:page/${id}`]),
    );
    const result = await withSelection(
      'user',
      (selection) => {
        const user = `edges { node { __typename ... on AtlassianUser { ${selection} } } }`;
        return `query AccordDecisionPeople(${pageIds.map((_, i) => `$p${i}: ID!`).join(', ')}) {
${pageIds
  .map(
    (_, i) =>
      `  o${i}: confluencePageOwners(id: $p${i}, first: 5) { ${user} }\n  c${i}: confluencePageContributors(id: $p${i}, first: 10) { ${user} }`,
  )
  .join('\n')}
}`;
      },
      variables,
    );
    if (!result?.data)
      return { ...empty, note: 'Teamwork Graph is not available for this site or user.' };
    pageIds.forEach((id, i) => {
      context.people[id] = {
        owners: parsePeople(result.data?.[`o${i}`]),
        contributors: parsePeople(result.data?.[`c${i}`]),
      };
    });
  }
  if (issues.length) {
    const variables = Object.fromEntries(
      issues.map((issue, i) => [`i${i}`, `ari:cloud:jira:${cloudId}:issue/${issue.id}`]),
    );
    const result = await withSelection(
      'goal',
      (selection) => `query AccordWorkGoals(${issues.map((_, i) => `$i${i}: ID!`).join(', ')}) {
${issues
  .map(
    (_, i) =>
      `  g${i}: jiraWorkItemGoals(id: $i${i}, first: 5) { edges { node { __typename ... on AtlassianGoal { ${selection} } } } }`,
  )
  .join('\n')}
}`,
      variables,
    );
    issues.forEach((issue, i) => {
      context.goals[issue.key] = parseGoals(result?.data?.[`g${i}`]);
    });
  }
  return context;
}
