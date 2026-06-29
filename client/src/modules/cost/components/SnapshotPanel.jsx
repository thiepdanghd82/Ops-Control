/**
 * SnapshotPanel — collapsible pricing-snapshot audit info, rendered at
 * the bottom of Cost Breakdown (Std + Cpx). Surfaces:
 *   - Status: persisted (frozen) vs synthesized (live rates) vs empty
 *   - Captured at / by / under what site
 *   - Library version + lib row counts (materials / workcenters / coverage)
 *   - Any `_warnings` carried by the calcAll result (site_mismatch etc.)
 *
 * Native <details> for collapse (repo pattern — ImportWizard, ModeSection).
 * <StatusBadge> reused for the source pill.
 *
 * Pure presentation — caller resolves snapshot via snapshotPricingParams
 * and passes `source` + `snapshot` + optional `warnings`. No state, no
 * hooks, so node:test can exercise the pure derivation helpers in a
 * sibling .js file.
 */
import StatusBadge from '../../../components/Shared/StatusBadge';
import {
  formatSnapshotDateTime,
  resolveSnapshotTone,
  resolveSnapshotStatusLabel,
  resolveSnapshotBadgeLabel,
  countSnapshotEntries,
} from './SnapshotPanel.helpers.js';
import './SnapshotPanel.css';

export default function SnapshotPanel({ source, snapshot, warnings }) {
  // Defensive — caller may pass null for a quote without a snapshot
  // resolved yet (initial render / no lib loaded). Render the empty
  // shell so the section still appears (operator sees "no pricing data
  // captured yet" rather than a missing panel).
  const safeSource = source || 'empty';
  const safeSnapshot = snapshot || null;
  const tone = resolveSnapshotTone(safeSource);
  const badgeLabel = resolveSnapshotBadgeLabel(safeSource);
  const statusLabel = resolveSnapshotStatusLabel(safeSource);
  const counts = countSnapshotEntries(safeSnapshot);
  const warningList = Array.isArray(warnings) ? warnings : [];

  return (
    <details className="snapshot-panel">
      <summary className="snapshot-panel-summary">
        <span className="snapshot-panel-title">Pricing Snapshot</span>
        <StatusBadge tone={tone} label={badgeLabel} size="sm" />
        {warningList.length > 0 && (
          <StatusBadge
            tone="danger"
            label={`${warningList.length} warning${warningList.length > 1 ? 's' : ''}`}
            size="sm"
          />
        )}
      </summary>
      <dl className="snapshot-panel-fields">
        <dt>Captured at</dt>
        <dd>{formatSnapshotDateTime(safeSnapshot?._captured_at)}</dd>

        <dt>Captured by</dt>
        <dd>{safeSnapshot?._captured_by || '—'}</dd>

        <dt>Site</dt>
        <dd>{safeSnapshot?._site || '—'}</dd>

        <dt>Library version</dt>
        <dd>{safeSnapshot?._lib_version || '—'}</dd>

        <dt>Status</dt>
        <dd className={`snapshot-panel-status snapshot-panel-status-${safeSource}`}>
          {statusLabel}
        </dd>

        <dt>Materials frozen</dt>
        <dd>{counts.materials}</dd>

        <dt>Workcenters frozen</dt>
        <dd>{counts.rates}</dd>

        <dt>Coverage rows</dt>
        <dd>{counts.coverage}</dd>

        {warningList.length > 0 && (
          <>
            <dt>Warnings</dt>
            <dd>
              <ul className="snapshot-panel-warnings">
                {warningList.map((w, i) => (
                  <li key={i}>{w?.message || String(w)}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </details>
  );
}
