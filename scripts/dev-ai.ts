import type { Plugin } from 'vite';
import { verifyDraft } from '../src/domain/draft';
import { parseAssessment, relations } from '../src/domain/drift';
import { ASSESS_SYSTEM, DRAFT_SYSTEM } from '../src/domain/prompts';

/**
 * Local demo only. When GEMINI_API_KEY is set in .env, `npm run dev` can call
 * Gemini so the standalone demo shows real model output. The key never reaches
 * the browser, the build or the Forge app, and results pass the same verification
 * as Forge LLM output.
 */
export function devAi(env: Record<string, string>): Plugin {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  async function gemini(system: string, user: string, schemaHint: string): Promise<unknown> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${system}\n\n${schemaHint}` }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  }

  return {
    name: 'accord-dev-ai',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev-ai', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          if (req.url === '/status') return send(200, { enabled: Boolean(key), model });
          if (!key || req.method !== 'POST') return send(404, { error: 'disabled' });
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
          if (req.url === '/draft') {
            const text = String(input.pageText ?? '').slice(0, 40_000);
            const raw = await gemini(
              DRAFT_SYSTEM,
              `Decision page title: ${String(input.pageTitle ?? '')}\n<page>\n${text}\n</page>`,
              'Reply with JSON: {"title": string, "owner": string, "appliesTo": string[], "commitments": [{"kind": "stated"|"requires_done"|"forbids_label"|"requires_owner", "summary": string, "quote": string, "issueKey"?: string, "label"?: string}]}',
            );
            return send(200, {
              model,
              draft: verifyDraft(raw, text, String(input.pageTitle ?? '')),
            });
          }
          if (req.url === '/explain') {
            const raw = await gemini(
              ASSESS_SYSTEM,
              `<old>\n${String(input.before ?? '').slice(0, 600)}\n</old>\n<new>\n${String(input.after ?? '').slice(0, 1200)}\n</new>`,
              `Reply with JSON: {"relation": ${relations.map((r) => `"${r}"`).join('|')}, "reason": string (one sentence, at most 30 words)}`,
            );
            return send(200, { ...parseAssessment(raw), model });
          }
          return send(404, { error: 'unknown' });
        } catch (error) {
          return send(502, {
            error: error instanceof Error ? error.message : 'Model call failed.',
          });
        }
      });
    },
  };
}
