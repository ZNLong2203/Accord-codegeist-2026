/**
 * Context Accord reads from Atlassian's Teamwork Graph: who shaped a decision,
 * and which goals the affected work contributes to. It enriches a review; it is
 * never used to decide whether a check passes.
 */
export interface GraphPerson {
  name: string;
  accountId?: string;
}
export interface GraphGoal {
  name: string;
  url?: string;
}
export interface GraphContext {
  source: 'teamwork-graph' | 'demo';
  available: boolean;
  people: Record<string, { owners: GraphPerson[]; contributors: GraphPerson[] }>;
  goals: Record<string, GraphGoal[]>;
  note?: string;
}

function nodes(connection: unknown): Record<string, unknown>[] {
  const edges = (connection as { edges?: unknown[] } | null)?.edges;
  if (!Array.isArray(edges)) return [];
  return edges
    .map((edge) => (edge as { node?: unknown })?.node)
    .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object');
}

function label(node: Record<string, unknown>): string | null {
  for (const key of ['name', 'displayName', 'title']) {
    const value = node[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  }
  return null;
}

export function parsePeople(connection: unknown): GraphPerson[] {
  const seen = new Set<string>();
  const result: GraphPerson[] = [];
  for (const node of nodes(connection)) {
    const name = label(node);
    if (!name) continue;
    const accountId =
      typeof node.accountId === 'string'
        ? node.accountId
        : typeof node.id === 'string' && node.id.includes('identity::user/')
          ? node.id.split('/').pop()
          : undefined;
    const identity = accountId ?? name;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(accountId ? { name, accountId } : { name });
  }
  return result.slice(0, 10);
}

export function parseGoals(connection: unknown): GraphGoal[] {
  const seen = new Set<string>();
  const result: GraphGoal[] = [];
  for (const node of nodes(connection)) {
    const name = label(node);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const url = [node.url, node.webUrl].find(
      (value): value is string => typeof value === 'string' && value.startsWith('https://'),
    );
    result.push(url ? { name, url } : { name });
  }
  return result.slice(0, 10);
}

/** Goals touched by the given work items, deduplicated by name. */
export function goalsAtStake(context: GraphContext | null, keys: string[]): GraphGoal[] {
  if (!context?.available) return [];
  const byName = new Map<string, GraphGoal>();
  for (const key of keys) for (const goal of context.goals[key] ?? []) byName.set(goal.name, goal);
  return [...byName.values()];
}
