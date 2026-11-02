/**
 * Deterministic text utilities for decision pages. Nothing here calls a model:
 * quotes are matched verbatim (after whitespace/typography normalisation), so a
 * drafted commitment can only be confirmed when its source sentence exists.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: '-',
  mdash: '-',
  hellip: '...',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const BLOCK = /<\/?(?:p|div|h[1-6]|li|ul|ol|tr|td|th|table|blockquote|pre|br|hr)\b[^>]*>/gi;

/** Converts Confluence storage XHTML into block-separated plain text. */
export function storageToText(storage: string): string {
  if (storage.length > 250_000) throw new Error('Decision page exceeds the 250 KB parsing limit.');
  const withoutMacrosBodies = storage
    // Code blocks (including legacy Accord JSON) are data, not prose.
    .replace(/<ac:structured-macro[^>]*ac:name="code"[\s\S]*?<\/ac:structured-macro>/gi, '\n')
    // Jira issue macros render as their key.
    .replace(
      /<ac:structured-macro[^>]*ac:name="jira"[\s\S]*?<ac:parameter ac:name="key">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/gi,
      ' $1 ',
    )
    .replace(/<ac:parameter[\s\S]*?<\/ac:parameter>/gi, ' ');
  return decodeEntities(withoutMacrosBodies.replace(BLOCK, '\n').replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 60_000);
}

/** Lowercase, unify typography and collapse whitespace. Keeps words and digits. */
export function normalise(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[\s.;:,!]+$/, '')
    .trim();
}

/** Only letters and digits: two texts equal under this differ only in formatting. */
function skeleton(value: string): string {
  return normalise(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

export function splitSentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 1);
}

/** True when the quote appears verbatim in the text, ignoring case and typography. */
export function containsQuote(text: string, quote: string): boolean {
  const needle = normalise(quote);
  if (needle.length < 8) return false;
  return normalise(text.replace(/\n/g, ' ')).includes(needle);
}

export function issueKeysIn(text: string): string[] {
  return [...new Set(text.match(/\b[A-Z][A-Z0-9_]{1,9}-\d+\b/g) ?? [])];
}

export type SentenceChange = { kind: 'same' | 'added' | 'removed'; text: string };

/** Sentence-level LCS diff; formatting-only edits compare equal. */
export function sentenceDiff(before: string, after: string): SentenceChange[] {
  const a = splitSentences(before).slice(0, 400);
  const b = splitSentences(after).slice(0, 400);
  const ka = a.map(skeleton);
  const kb = b.map(skeleton);
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] =
        ka[i] === kb[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const result: SentenceChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      result.push({ kind: 'same', text: b[j] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) result.push({ kind: 'removed', text: a[i++] });
    else result.push({ kind: 'added', text: b[j++] });
  }
  while (i < a.length) result.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) result.push({ kind: 'added', text: b[j++] });
  return result;
}

/** Edits that change only whitespace, punctuation or letter case. */
export function isCosmeticChange(before: string, after: string): boolean {
  return skeleton(before) === skeleton(after);
}

function words(value: string): Set<string> {
  return new Set(normalise(value).match(/[\p{L}\p{N}-]{3,}/gu) ?? []);
}

/**
 * The added sentence that most resembles a removed one, so a reviewer can see
 * what a commitment's source sentence became. A hint, never a verdict.
 */
export function likelyReplacement(quote: string, changes: SentenceChange[]): string | null {
  const target = words(quote);
  let best: { text: string; score: number } | null = null;
  for (const change of changes) {
    if (change.kind !== 'added') continue;
    const candidate = words(change.text);
    const shared = [...target].filter((word) => candidate.has(word)).length;
    const score = shared / Math.max(1, new Set([...target, ...candidate]).size);
    if (score >= 0.25 && (!best || score > best.score)) best = { text: change.text, score };
  }
  return best?.text ?? null;
}
