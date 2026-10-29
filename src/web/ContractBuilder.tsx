import { useMemo, useState } from 'react';
import { BookOpen, Check, Copy, Download, Plus, Trash2 } from 'lucide-react';
import { contractSchema, type Contract, type Snapshot } from '../domain/schema';
import { isLive } from './client';
import { Tag } from './ui';

type DraftRule = {
  id: string;
  kind: 'requires_done' | 'requires_owner' | 'forbids_label';
  value: string;
  summary: string;
};
export function ContractBuilder({
  snapshot,
  onAdd,
}: {
  snapshot: Snapshot | null;
  onAdd?: (contract: Contract) => void;
}) {
  const [title, setTitle] = useState('A decision worth keeping');
  const [owner, setOwner] = useState('');
  const [rationale, setRationale] = useState('');
  const [appliesTo, setAppliesTo] = useState(
    snapshot?.issues.find((issue) => issue.inScope)?.key ?? '',
  );
  const [rules, setRules] = useState<DraftRule[]>([
    { id: 'required-work', kind: 'requires_done', value: '', summary: '' },
  ]);
  const [notice, setNotice] = useState('');
  const parsed = useMemo(
    () =>
      contractSchema.safeParse({
        schemaVersion: 1,
        title,
        owner,
        rationale,
        appliesTo: appliesTo
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean),
        rules: rules.map((rule) => ({
          id: rule.id,
          kind: rule.kind,
          summary: rule.summary,
          ...(rule.kind === 'requires_done'
            ? { issueKey: rule.value.trim() }
            : rule.kind === 'forbids_label'
              ? { label: rule.value.trim() }
              : {}),
        })),
      }),
    [title, owner, rationale, appliesTo, rules],
  );
  const json = parsed.success ? JSON.stringify(parsed.data, null, 2) : '';
  function preset(kind: 'security' | 'owner' | 'api') {
    const mapping = {
      security: {
        title: 'Session security review',
        rationale: 'The session flow needs independently completed rotation tests.',
        applies: 'PLAT-142',
        rule: {
          id: 'rotation-tests',
          kind: 'requires_done' as const,
          value: 'PLAT-139',
          summary: 'Token rotation regression tests must be Done before the session flow ships.',
        },
      },
      owner: {
        title: 'Accountable rollout',
        rationale: 'Every rollout needs a person who owns the rollback window.',
        applies: 'PLAT-148',
        rule: {
          id: 'named-owner',
          kind: 'requires_owner' as const,
          value: '',
          summary: 'Assign an accountable rollout owner.',
        },
      },
      api: {
        title: 'API compatibility promise',
        rationale: 'Existing customer integrations must keep working.',
        applies: 'PLAT-145, PLAT-146',
        rule: {
          id: 'compatible-api',
          kind: 'forbids_label' as const,
          value: 'breaking-change',
          summary: 'No breaking API change in this release.',
        },
      },
    }[kind];
    setTitle(mapping.title);
    setRationale(mapping.rationale);
    setAppliesTo(mapping.applies);
    setOwner('Release owner');
    setRules([mapping.rule]);
    setNotice('Template filled. Replace the example keys with your team’s work.');
  }
  function changeRule(id: string, patch: Partial<DraftRule>) {
    setRules((previous) => previous.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    setNotice('');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setNotice('Contract copied. Paste it into a Confluence code block.');
    } catch {
      setNotice('Select the JSON preview below and copy it manually.');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'accord-contract.json';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Contract downloaded. No Confluence page was created.');
  }
  return (
    <section className="panel settings-card contract-builder" aria-labelledby="builder-title">
      <div className="section-top">
        <div>
          <h2 id="builder-title">Build a decision contract</h2>
          <p>Start with the promise. We’ll handle the JSON.</p>
        </div>
        <Tag tone="success">NO CODE NEEDED</Tag>
      </div>
      <div className="builder-templates">
        <span>Start with a template</span>
        <button onClick={() => preset('security')}>Security gate</button>
        <button onClick={() => preset('owner')}>Rollout owner</button>
        <button onClick={() => preset('api')}>API promise</button>
      </div>
      <div className="builder-grid">
        <div className="builder-fields">
          <label className="form-field">
            <span>Decision title</span>
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Accountable owner</span>
            <input
              value={owner}
              maxLength={100}
              placeholder="Maya Chen"
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <label className="form-field wide">
            <span>What is the promise, and why does it matter?</span>
            <textarea
              rows={3}
              value={rationale}
              maxLength={1200}
              placeholder="Keep this concrete enough for a reviewer to check."
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
          <label className="form-field wide">
            <span>Applies to these Jira work items</span>
            <input
              value={appliesTo}
              placeholder="PLAT-142, PLAT-145"
              onChange={(e) => setAppliesTo(e.target.value.toUpperCase())}
            />
            <small>
              Comma-separated issue keys. These define the explicit scope of this decision.
            </small>
          </label>
          <div className="builder-rules">
            <h3>Checkable commitments</h3>
            {rules.map((rule, index) => (
              <fieldset className="builder-rule" key={rule.id}>
                <legend>Commitment {index + 1}</legend>
                <div className="rule-heading">
                  <select
                    aria-label={`Commitment ${index + 1} type`}
                    value={rule.kind}
                    onChange={(e) =>
                      changeRule(rule.id, { kind: e.target.value as DraftRule['kind'] })
                    }
                  >
                    <option value="requires_done">Required work must be Done</option>
                    <option value="requires_owner">A named owner is required</option>
                    <option value="forbids_label">A label must not be present</option>
                  </select>
                  <button
                    aria-label={`Remove commitment ${index + 1}`}
                    className="icon-button"
                    onClick={() =>
                      setRules((previous) => previous.filter((item) => item.id !== rule.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {rule.kind !== 'requires_owner' && (
                  <label className="form-field wide">
                    <span>
                      {rule.kind === 'requires_done'
                        ? 'Prerequisite issue key'
                        : 'Prohibited label'}
                    </span>
                    <input
                      value={rule.value}
                      placeholder={rule.kind === 'requires_done' ? 'PLAT-139' : 'breaking-change'}
                      onChange={(e) => changeRule(rule.id, { value: e.target.value })}
                    />
                  </label>
                )}
                <label className="form-field wide">
                  <span>Explain the commitment</span>
                  <input
                    value={rule.summary}
                    maxLength={300}
                    placeholder="What should a reviewer verify?"
                    onChange={(e) => changeRule(rule.id, { summary: e.target.value })}
                  />
                </label>
              </fieldset>
            ))}
            <button
              className="text-button"
              disabled={rules.length >= 20}
              onClick={() =>
                setRules((previous) => [
                  ...previous,
                  {
                    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
                    kind: 'requires_done',
                    value: '',
                    summary: '',
                  },
                ])
              }
            >
              <Plus size={15} />
              Add commitment
            </button>
          </div>
        </div>
        <aside className="builder-preview">
          <div>
            <BookOpen size={19} />
            <h3>Your Confluence code block</h3>
          </div>
          <p>
            Copy the validated contract into one Code block on your decision page, publish it, then
            adopt its version in Accord.
          </p>
          {json ? (
            <pre tabIndex={0} aria-label="Generated contract JSON">
              {json}
            </pre>
          ) : (
            <div className="builder-incomplete">
              <span>
                Finish the promise, owner, applicable keys and commitments to generate a valid
                contract.
              </span>
            </div>
          )}
          <div className="builder-actions">
            <button className="button secondary" disabled={!json} onClick={copy}>
              <Copy size={15} />
              Copy JSON
            </button>
            <button className="button secondary" disabled={!json} onClick={download}>
              <Download size={15} />
              Download
            </button>
          </div>
          {!isLive && onAdd && (
            <button
              className="button primary full-width"
              disabled={!parsed.success || (snapshot?.decisions.length ?? 0) >= 10}
              onClick={() => {
                if (parsed.success) {
                  onAdd(parsed.data);
                  setNotice(
                    'Decision added to the local demo library. No Confluence page was created.',
                  );
                }
              }}
            >
              <Plus size={15} />
              Add to demo library
            </button>
          )}
          <p className="fineprint">
            This builder creates an explicit draft. Your team reviews its applicability and meaning.
            It does not extract commitments from prose.
          </p>
        </aside>
      </div>
      {notice && (
        <div className="inline-info" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </section>
  );
}
