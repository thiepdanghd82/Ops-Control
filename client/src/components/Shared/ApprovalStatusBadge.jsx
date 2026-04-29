/**
 * ApprovalStatusBadge — compact status pill for a quote row. Click
 * surfaces the approval history via the `onOpenHistory` callback so
 * QuoteHistory can keep a single modal instance for the whole table.
 *
 * Sprint 6.3.
 */
import StatusBadge from './StatusBadge';
import { statusDisplay } from '../../utils/approvalWorkflow';

export default function ApprovalStatusBadge({ approval, onOpenHistory }) {
  const { label, tone } = statusDisplay(approval?.status);
  const historyCount = Array.isArray(approval?.history) ? approval.history.length : 0;
  const clickable = typeof onOpenHistory === 'function';

  return (
    <button
      type="button"
      onClick={clickable ? onOpenHistory : undefined}
      disabled={!clickable}
      title={clickable
        ? `${label} — click for history (${historyCount} transitions)`
        : label}
      style={{
        padding: 0, border: 'none', background: 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      <StatusBadge tone={tone} label={label} size="sm" />
      {historyCount > 0 && (
        <span style={{
          fontSize: 10, color: '#6f6f6f',
          fontVariantNumeric: 'tabular-nums',
        }}>{historyCount}</span>
      )}
    </button>
  );
}
