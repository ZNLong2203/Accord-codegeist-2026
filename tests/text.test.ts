import { describe, expect, it } from 'vitest';
import {
  containsQuote,
  isCosmeticChange,
  issueKeysIn,
  likelyReplacement,
  sentenceDiff,
  storageToText,
} from '../src/domain/text';

describe('decision page text', () => {
  it('turns Confluence storage into block text and drops code blocks', () => {
    const storage =
      '<h1>Token policy</h1><p>Refresh tokens rotate&nbsp;every 24&nbsp;hours.</p>' +
      '<ul><li>Owner: Maya</li></ul>' +
      '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="server">x</ac:parameter><ac:parameter ac:name="key">PLAT-139</ac:parameter></ac:structured-macro>' +
      '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[{"secret":1}]]></ac:plain-text-body></ac:structured-macro>';
    const text = storageToText(storage);
    expect(text.split('\n')).toEqual([
      'Token policy',
      'Refresh tokens rotate every 24 hours.',
      'Owner: Maya',
      'PLAT-139',
    ]);
    expect(issueKeysIn(text)).toEqual(['PLAT-139']);
  });

  it('matches quotes verbatim, ignoring case and typography only', () => {
    const text = 'We don’t ship   PLAT-142 until\nPLAT-139 is Done.';
    expect(containsQuote(text, "we don't ship PLAT-142 until PLAT-139 is done")).toBe(true);
    expect(containsQuote(text, 'We ship PLAT-142 before PLAT-139 is Done.')).toBe(false);
    expect(containsQuote(text, 'Done')).toBe(false);
  });

  it('diffs by sentence and treats punctuation-only edits as cosmetic', () => {
    const before = 'Tokens rotate daily. Tests must pass.';
    const after = 'Tokens rotate on every use. Tests must pass!';
    expect(sentenceDiff(before, after)).toEqual([
      { kind: 'removed', text: 'Tokens rotate daily.' },
      { kind: 'added', text: 'Tokens rotate on every use.' },
      { kind: 'same', text: 'Tests must pass!' },
    ]);
    expect(isCosmeticChange('Tests must pass.', 'tests  must pass!')).toBe(true);
    expect(isCosmeticChange(before, after)).toBe(false);
  });

  it('suggests the most similar replacement sentence, or none', () => {
    const changes = sentenceDiff(
      'Refresh tokens rotate every 24 hours. Owners sign off.',
      'Refresh tokens rotate on every use. Owners sign off. Unrelated note here.',
    );
    expect(likelyReplacement('Refresh tokens rotate every 24 hours.', changes)).toBe(
      'Refresh tokens rotate on every use.',
    );
    expect(likelyReplacement('Budgets are frozen for Q4.', changes)).toBeNull();
  });
});

describe('quote boundaries', () => {
  it('rejects a quote embedded in a negated or qualified sentence', () => {
    const text = 'We no longer require that refresh tokens rotate every 24 hours.';
    expect(containsQuote(text, 'Refresh tokens rotate every 24 hours.')).toBe(false);
    expect(
      containsQuote(
        'Refresh tokens rotate every 24 hours unless an admin opts out.',
        'Refresh tokens rotate every 24 hours.',
      ),
    ).toBe(false);
  });

  it('accepts a whole sentence after a short label, or a few joined sentences', () => {
    expect(
      containsQuote(
        'Decision: Refresh tokens rotate every 24 hours.',
        'Refresh tokens rotate every 24 hours.',
      ),
    ).toBe(true);
    expect(
      containsQuote('First rule. Second rule applies.', 'First rule. Second rule applies.'),
    ).toBe(true);
  });

  it('keeps text between a keyless Jira macro and a later issue macro', () => {
    const storage =
      '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="jqlQuery">project = X</ac:parameter></ac:structured-macro>' +
      '<p>Refresh tokens rotate every 24 hours.</p>' +
      '<ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">PLAT-139</ac:parameter></ac:structured-macro>';
    const text = storageToText(storage);
    expect(containsQuote(text, 'Refresh tokens rotate every 24 hours.')).toBe(true);
    expect(issueKeysIn(text)).toEqual(['PLAT-139']);
  });
});
