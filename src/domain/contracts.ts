import { contractSchema, type Contract } from './schema';

/** Only parse explicit Confluence code blocks, never model-generated prose. */
export function parseContract(storageBody: string): Contract {
  if (storageBody.length > 250_000)
    throw new Error('Decision page exceeds the 250 KB parsing limit.');
  const candidates = [
    ...storageBody.matchAll(
      /<ac:plain-text-body>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/ac:plain-text-body>/g,
    ),
  ]
    .map((match) => match[1])
    .filter((body) => body.includes('"schemaVersion"'));
  if (candidates.length !== 1)
    throw new Error('Each selected page must contain exactly one Accord JSON code block.');
  return contractSchema.parse(JSON.parse(candidates[0]));
}
