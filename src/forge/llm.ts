import { chat, list } from '@forge/llm';
import { verifyDraft, type VerifiedDraft } from '../domain/draft';
import { ASSESS_SYSTEM, DRAFT_SYSTEM } from '../domain/prompts';
import { parseAssessment, relations, type ChangeAssessment } from '../domain/drift';

const PREFERRED = ['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];

async function pickModel(): Promise<string> {
  try {
    const { models } = await list();
    const active = models.filter((m) => m.status === 'active').map((m) => m.model);
    return (
      PREFERRED.find((model) => active.includes(model)) ??
      active.find((model) => model.includes('sonnet')) ??
      active[0] ??
      PREFERRED[0]
    );
  } catch {
    return PREFERRED[0];
  }
}

const TOOL = {
  type: 'function' as const,
  function: {
    name: 'record_commitments',
    description: 'Record the commitments the decision page makes, each with a verbatim quote.',
    parameters: {
      type: 'object',
      required: ['commitments'],
      properties: {
        title: { type: 'string', description: 'Short decision title.' },
        owner: { type: 'string', description: 'Named decision owner, if the page names one.' },
        appliesTo: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Jira keys written on the page for the work built under this decision. Exclude prerequisites that only need to be finished first.',
        },
        commitments: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            required: ['kind', 'summary', 'quote'],
            properties: {
              kind: {
                type: 'string',
                enum: ['stated', 'requires_done', 'forbids_label', 'requires_owner'],
              },
              summary: { type: 'string', description: 'At most 20 words, plain language.' },
              quote: {
                type: 'string',
                description: 'One complete sentence copied character-for-character from the page.',
              },
              issueKey: { type: 'string', description: 'requires_done only: the prerequisite.' },
              label: { type: 'string', description: 'forbids_label only: the Jira label.' },
            },
          },
        },
      },
    },
  },
};

export async function draftWithModel(pageTitle: string, pageText: string) {
  const model = await pickModel();
  const response = await chat({
    model,
    max_completion_tokens: 2000,
    messages: [
      { role: 'system', content: DRAFT_SYSTEM },
      {
        role: 'user',
        content: `Decision page title: ${pageTitle}\n<page>\n${pageText.slice(0, 40_000)}\n</page>`,
      },
    ],
    tools: [TOOL],
    tool_choice: { type: 'function', function: { name: 'record_commitments' } },
  });
  const call = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('The model did not return a structured draft. Try again.');
  let draft: VerifiedDraft;
  try {
    const args =
      typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
    draft = verifyDraft(args, pageText, pageTitle);
  } catch {
    throw new Error('The model returned a draft Accord could not read. Try again.');
  }
  return { model, draft };
}

const ASSESS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'assess_change',
    description: 'Say how the new wording relates to the commitment the work was built on.',
    parameters: {
      type: 'object',
      required: ['relation', 'reason'],
      properties: {
        relation: {
          type: 'string',
          enum: [...relations],
          description:
            'contradicts: work built on the old wording would now be wrong. weakens: the new wording asks for less. strengthens: it asks for more. compatible: same obligation. unclear: cannot tell.',
        },
        reason: { type: 'string', description: 'One plain sentence, at most 30 words.' },
      },
    },
  },
};

/** Advisory comparison of an old commitment with its replacement text. */
export async function assessChangeWithModel(
  before: string,
  after: string,
): Promise<ChangeAssessment> {
  const model = await pickModel();
  const response = await chat({
    model,
    max_completion_tokens: 400,
    messages: [
      { role: 'system', content: ASSESS_SYSTEM },
      {
        role: 'user',
        content: `<old>\n${before.slice(0, 600)}\n</old>\n<new>\n${after.slice(0, 1200)}\n</new>`,
      },
    ],
    tools: [ASSESS_TOOL],
    tool_choice: { type: 'function', function: { name: 'assess_change' } },
  });
  const call = response.choices?.[0]?.message?.tool_calls?.[0];
  let raw: unknown = null;
  try {
    raw =
      typeof call?.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call?.function.arguments;
  } catch {
    raw = null;
  }
  return { ...parseAssessment(raw), model };
}
