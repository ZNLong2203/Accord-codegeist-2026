import { describe, expect, it } from 'vitest';
import { adoptDemoDecision, contractChanges, contractStorageBlock } from '../src/domain/changes';
import { createDemoSnapshot } from '../src/domain/demo';
import { parseContract } from '../src/domain/contracts';
import { assess } from '../src/domain/engine';

describe('explicit source review', () => {
  it('separates added, removed and modified commitments from source prose', () => {
    const before = createDemoSnapshot().decisions[0].contract;
    const after = {
      ...structuredClone(before),
      owner: 'Another owner',
      appliesTo: ['PLAT-149'],
      rules: [
        {
          id: 'named-owner',
          kind: 'requires_owner' as const,
          summary: 'A named owner is required.',
        },
      ],
    };
    const changes = contractChanges(before, after);
    expect(changes.map((change) => change.field)).toContain('owner');
    expect(changes.find((change) => change.field === 'Applicable work')?.after).toBe('PLAT-149');
    expect(changes.find((change) => change.field.includes('rotation-tests'))?.kind).toBe('removed');
    expect(changes.find((change) => change.field.includes('named-owner'))?.kind).toBe('added');
  });

  it('adopts current commitments without mutating the source or completing prerequisites', () => {
    const snapshot = createDemoSnapshot();
    const decision = snapshot.decisions[0];
    const original = structuredClone(decision);
    const next = {
      ...snapshot,
      decisions: snapshot.decisions.map((d) => (d.id === decision.id ? adoptDemoDecision(d) : d)),
    };
    expect(assess(next).findings.map((f) => f.kind)).toEqual(['dependency', 'owner']);
    expect(next.decisions[0].contract.rationale).toBe(decision.currentExcerpt);
    expect(decision).toEqual(original);
    expect(snapshot.issues.find((i) => i.key === 'PLAT-139')?.statusCategory).toBe('indeterminate');
  });

  it('rejects re-review of an inaccessible source', () => {
    const decision = createDemoSnapshot().decisions[0];
    decision.accessible = false;
    expect(() => adoptDemoDecision(decision)).toThrow('readable');
  });

  it('round-trips code macros even when user text contains a CDATA terminator', () => {
    const contract = createDemoSnapshot().decisions[0].contract;
    contract.rationale =
      'Literal text with ]]> and <script>example</script>, not executable markup.';
    expect(parseContract(contractStorageBlock(contract))).toEqual(contract);
  });
});
