import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  GitBranch,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { Snapshot, Finding } from '../domain/schema';
import { SourceIcon, Tag } from './ui';
export function EvidenceMap({
  snapshot,
  findings,
  excluded,
  onSelect,
}: {
  snapshot: Snapshot;
  findings: Finding[];
  excluded: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="evidence-map">
      <div className="graph-col-labels">
        <span>DECISIONS IN CONFLUENCE</span>
        <span>THE CONTEXT CONNECTION</span>
        <span>WORK IN JIRA</span>
      </div>
      <div className="graph-lanes">
        {snapshot.decisions.map((decision, index) => {
          const signals = findings.filter((finding) => finding.decisionId === decision.id);
          const affected =
            decision.currentVersion !== decision.reviewedVersion
              ? [...new Set([...decision.contract.appliesTo, ...(decision.currentAppliesTo ?? [])])]
              : decision.contract.appliesTo;
          const visible = affected.filter((key) =>
            snapshot.issues.some((issue) => issue.key === key && issue.inScope),
          );
          const deferred = visible.length > 0 && visible.every((key) => excluded.includes(key));
          return (
            <div
              className={`graph-lane ${signals.length ? 'has-signals' : ''} ${deferred ? 'is-deferred' : ''}`}
              key={decision.id}
            >
              <button className="graph-node decision-node" onClick={() => onSelect(decision.id)}>
                <SourceIcon type="confluence" />
                <span>
                  <strong>{decision.title}</strong>
                  <small>
                    {decision.owner}
                    <span>
                      v{decision.reviewedVersion}
                      {decision.reviewedVersion !== decision.currentVersion && (
                        <>
                          {' '}
                          <ArrowRight size={10} /> v{decision.currentVersion}
                        </>
                      )}
                    </span>
                  </small>
                </span>
                <span className={`node-state ${signals.length ? 'attention' : ''}`}>
                  {signals.length ? <Activity size={14} /> : <Check size={14} />}
                </span>
              </button>
              <div className="graph-connector">
                <span className="connector-line" />
                <span className="connection-label">
                  {deferred
                    ? 'Deferred in scenario'
                    : signals.length
                      ? `${signals.length} signal${signals.length !== 1 ? 's' : ''} to revisit`
                      : visible.length === 0
                        ? 'Outside this scope'
                        : 'Commitments in sync'}
                </span>
                <span className="connector-line" />
                <ChevronRight size={13} />
              </div>
              <button
                className="graph-node issue-node"
                onClick={() => onSelect(signals[0]?.id ?? decision.id)}
              >
                <SourceIcon type="jira" />
                <span>
                  <strong>
                    {snapshot.issues.find((issue) => issue.key === affected[0])?.summary ??
                      'Affected work'}
                  </strong>
                  <small>
                    {affected.join(' · ')}
                    {index === 0 && (
                      <span>
                        {snapshot.issues.find((issue) => issue.key === affected[0])?.status}{' '}
                        <Check size={10} />
                      </span>
                    )}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FindingRow({
  finding,
  onClick,
  selected,
}: {
  finding: Finding;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button onClick={onClick} className={`finding-row ${selected ? 'selected' : ''}`}>
      <span className={`finding-icon ${finding.severity}`}>
        {finding.kind === 'page_changed' ? (
          <GitBranch size={18} />
        ) : finding.kind === 'owner' ? (
          <Users size={18} />
        ) : (
          <TriangleAlert size={18} />
        )}
      </span>
      <div className="finding-content">
        <div>
          <h3>{finding.title}</h3>
          <Tag tone={finding.severity}>
            {finding.severity === 'critical'
              ? 'Critical'
              : finding.severity === 'unknown'
                ? 'Unknown'
                : 'Review'}
          </Tag>
        </div>
        <p>
          {finding.kind === 'page_changed'
            ? 'The source has moved beyond the version this release was reviewed against.'
            : finding.kind === 'dependency'
              ? 'A confirmed prerequisite is still open, even though its dependent work is done.'
              : finding.explanation}
        </p>
      </div>
      <div className="finding-meta">
        <span>{finding.affectedKeys.join(', ') || 'Source coverage'}</span>
        <small>{finding.evidence.length} evidence points</small>
      </div>
      <ChevronRight size={17} />
    </button>
  );
}
