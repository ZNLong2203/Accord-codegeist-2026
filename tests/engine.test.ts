import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../src/domain/demo';
import {
  assess,
  buildDecisionText,
  findSmallestSafeScope,
  snapshotToken,
} from '../src/domain/engine';

describe('release commitments', () => {
  it('catches page edits and an open prerequisite even when dependent work is Done', () => {
    const result = assess(createDemoSnapshot());
    expect(result.findings.map((f) => f.kind)).toEqual(['page_changed', 'dependency', 'owner']);
    expect(result.findings.filter((f) => f.severity === 'critical')).toHaveLength(2);
    expect(result.scope).toHaveLength(8);
    expect(result.verdict).toBe('review');
  });

  it('recomputes a deferral without pretending the prerequisite was completed', () => {
    const snapshot = createDemoSnapshot();
    const original = structuredClone(snapshot);
    const result = assess(snapshot, ['PLAT-142', 'PLAT-142', 'DOESNOTEXIST-123']);
    expect(result.findings.map((f) => f.kind)).toEqual(['owner']);
    expect(result.excludedKeys).toEqual(['PLAT-142']);
    expect(snapshot).toEqual(original);
    expect(snapshot.issues.find((i) => i.key === 'PLAT-139')?.statusCategory).toBe('indeterminate');
    expect(assess(snapshot).findings).toHaveLength(3);
  });

  it('continues to require prerequisites outside the selected release', () => {
    const snapshot = createDemoSnapshot();
    expect(snapshot.issues.find((i) => i.key === 'PLAT-139')?.inScope).toBe(false);
    expect(assess(snapshot, ['PLAT-139']).findings.some((f) => f.kind === 'dependency')).toBe(true);
  });

  it('flags newly applicable work on an edited page without adopting unreviewed rules', () => {
    const snapshot = createDemoSnapshot();
    snapshot.decisions[0].currentAppliesTo = ['PLAT-149'];
    const result = assess(snapshot, ['PLAT-142']);
    expect(result.findings.find((f) => f.kind === 'page_changed')?.affectedKeys).toEqual([
      'PLAT-149',
    ]);
    expect(result.findings.some((f) => f.kind === 'dependency')).toBe(false);
  });

  it('never treats inaccessible or missing evidence as clear', () => {
    const snapshot = createDemoSnapshot();
    snapshot.decisions[0].accessible = false;
    expect(assess(snapshot, ['PLAT-142']).verdict).toBe('unknown');
    expect(findSmallestSafeScope(snapshot)).toBeNull();
    snapshot.decisions[0].accessible = true;
    snapshot.issues = snapshot.issues.filter((i) => i.key !== 'PLAT-139');
    expect(
      assess(snapshot).findings.find((f) => f.title === 'Cannot verify PLAT-139')?.severity,
    ).toBe('unknown');
  });

  it('retains incomplete coverage and rejects an empty hypothetical release', () => {
    const snapshot = createDemoSnapshot();
    snapshot.coverage = { complete: false, warnings: ['Search was truncated.'] };
    expect(assess(snapshot).verdict).toBe('unknown');
    expect(findSmallestSafeScope(snapshot)).toBeNull();
    const empty = assess(
      createDemoSnapshot(),
      snapshot.issues.filter((i) => i.inScope).map((i) => i.key),
    );
    expect(empty.verdict).toBe('unknown');
    expect(empty.findings.some((f) => f.id === 'empty-scope')).toBe(true);
  });

  it('catches a forbidden label only within the applicable release scope', () => {
    const snapshot = createDemoSnapshot();
    snapshot.issues.find((i) => i.key === 'PLAT-145')!.labels = ['breaking-change'];
    const finding = assess(snapshot).findings.find((f) => f.kind === 'forbidden_label');
    expect(finding?.affectedKeys).toEqual(['PLAT-145']);
    expect(assess(snapshot, ['PLAT-145']).findings.some((f) => f.kind === 'forbidden_label')).toBe(
      false,
    );
  });

  it('reports clear only after the selected commitments have been satisfied', () => {
    const snapshot = createDemoSnapshot();
    snapshot.decisions[0].currentVersion = snapshot.decisions[0].reviewedVersion;
    snapshot.issues.find((i) => i.key === 'PLAT-139')!.statusCategory = 'done';
    snapshot.issues.find((i) => i.key === 'PLAT-148')!.assignee = 'Jonah Rivera';
    expect(assess(snapshot).verdict).toBe('clear');
    expect(assess(snapshot).checkedRules).toBe(6);
  });
});

describe('counterfactual search', () => {
  it('finds the minimum-effort cut, preserving warnings and remaining work', () => {
    const plan = findSmallestSafeScope(createDemoSnapshot());
    expect(plan).toMatchObject({
      excludedKeys: ['PLAT-142'],
      effortDeferred: 5,
      remainingFindings: 1,
      exact: true,
    });
  });

  it('searches jointly across overlapping decisions instead of greedily deferring each finding', () => {
    const snapshot = createDemoSnapshot();
    snapshot.decisions = [
      {
        ...snapshot.decisions[0],
        contract: { ...snapshot.decisions[0].contract, appliesTo: ['PLAT-142', 'PLAT-145'] },
      },
    ];
    expect(findSmallestSafeScope(snapshot)?.excludedKeys.sort()).toEqual(['PLAT-142', 'PLAT-145']);
  });

  it('refuses an unbounded search and does not silently return a heuristic', () => {
    const snapshot = createDemoSnapshot();
    snapshot.issues.push(
      ...Array.from({ length: 8 }, (_, i) => ({ ...snapshot.issues[0], key: `PLAT-${500 + i}` })),
    );
    expect(findSmallestSafeScope(snapshot)).toBeNull();
  });
});

describe('recorded evidence', () => {
  it('compares all observed data while ignoring capture time and result order', () => {
    const snapshot = createDemoSnapshot();
    const reordered = {
      ...snapshot,
      capturedAt: '2030-01-01T00:00:00Z',
      issues: [...snapshot.issues].reverse(),
      decisions: [...snapshot.decisions].reverse(),
    };
    expect(snapshotToken(snapshot)).toBe(snapshotToken(reordered));
    reordered.issues[0] = { ...reordered.issues[0], updated: '2030-01-01T00:00:01Z' };
    expect(snapshotToken(snapshot)).not.toBe(snapshotToken(reordered));
  });

  it('records a human call without claiming findings were resolved or a release was authorized', () => {
    const text = buildDecisionText(createDemoSnapshot(), {
      outcome: 'hold',
      rationale: 'Security owner must review the changed decision.',
    });
    expect(text).toContain('Decision: HOLD');
    expect(text).toContain('Open signals: 3');
    expect(text).toContain('Does not resolve findings');
    expect(text).not.toContain('Rotation is optional');
  });
});
