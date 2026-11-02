import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../src/domain/demo';
import { issueContext, pageStatus } from '../src/domain/context';

describe('contextual surfaces', () => {
  it('tells a Done work item which commitment it was built on changed', () => {
    const context = issueContext(createDemoSnapshot(), 'PLAT-142');
    expect(context.inScope).toBe(true);
    expect(context.decisions.map((d) => d.title)).toEqual(['Session security & token rotation']);
    expect(context.decisions[0].rules.map((r) => r.state)).toEqual(['changed', 'stated']);
    expect(context.decisions[0].rules[0].replacement).toContain('rotate on every use');
    expect(context.findings.map((f) => f.kind)).toEqual(['commitment_changed', 'dependency']);
  });

  it('shows a prerequisite outside the release which decision depends on it', () => {
    const context = issueContext(createDemoSnapshot(), 'PLAT-139');
    expect(context.inScope).toBe(false);
    expect(context.decisions).toHaveLength(1);
    expect(context.findings.map((f) => f.kind)).toEqual(['dependency']);
  });

  it('has nothing to say about unrelated work', () => {
    const context = issueContext(createDemoSnapshot(), 'PLAT-143');
    expect(context.decisions).toEqual([]);
    expect(context.findings).toEqual([]);
  });

  it('summarises a decision page for its byline', () => {
    const decision = createDemoSnapshot().decisions[0];
    const status = pageStatus({
      pageId: decision.pageId,
      title: decision.title,
      currentVersion: 4,
      confirmedVersion: 3,
      contract: decision.contract,
      confirmedText: decision.reviewedText!,
      currentText: decision.currentText!,
      issues: [
        { key: 'PLAT-142', summary: 'Session', status: 'Done', done: true, url: '' },
        { key: 'PLAT-139', summary: 'Tests', status: 'In progress', done: false, url: '' },
      ],
    });
    expect(status.atRisk).toEqual(['PLAT-142']);
    expect(status.prerequisites.map((i) => i.key)).toEqual(['PLAT-139']);
    expect(status.rules.map((r) => r.state)).toEqual(['changed', 'stated']);
  });
});
