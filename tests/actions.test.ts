import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSnapshot } from '../src/domain/demo';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/forge/service', () => ({
  loadSnapshot: mocks.load,
  configure: vi.fn(),
  recordDecision: vi.fn(),
  adoptBaseline: vi.fn(),
}));
vi.mock('../src/forge/history', () => ({ loadHistory: vi.fn() }));
import { inspectDecisionChange } from '../src/forge/index';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(createDemoSnapshot());
});
describe('read-only decision change action', () => {
  it('returns inspectable differences from the selected source, without adopting them', async () => {
    const snapshot = createDemoSnapshot();
    mocks.load.mockResolvedValue(snapshot);
    const result = await inspectDecisionChange({ anchorIssue: 'PLAT-150', pageId: '1001' });
    expect(result.reviewedVersion).toBe(3);
    expect(result.currentVersion).toBe(4);
    expect(result.changes.find((change) => change.field === 'rationale')?.after).toContain(
      'on every use',
    );
    expect(snapshot.decisions[0].reviewedVersion).toBe(3);
  });
  it('refuses to expose a source that is unreadable or was not selected', async () => {
    const snapshot = createDemoSnapshot();
    snapshot.decisions[0].accessible = false;
    mocks.load.mockResolvedValue(snapshot);
    await expect(
      inspectDecisionChange({ anchorIssue: 'PLAT-150', pageId: '1001' }),
    ).rejects.toThrow('unavailable');
    await expect(
      inspectDecisionChange({ anchorIssue: 'PLAT-150', pageId: '999999' }),
    ).rejects.toThrow('not selected');
  });
  it('validates page IDs before reading a source', async () => {
    await expect(
      inspectDecisionChange({ anchorIssue: 'PLAT-150', pageId: '../../secret' }),
    ).rejects.toThrow();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
