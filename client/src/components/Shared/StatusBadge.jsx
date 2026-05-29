/**
 * StatusBadge — single, consistent pill for status labels.
 *
 * Replaces the ~5 ad-hoc badge styles scattered across tabs
 * (.rfq-kpi-win, .st-badge-closed, .inv-tabbar-btn.primary, etc.) with
 * a token-based set of variants. IBM Carbon-inspired semantic colors.
 *
 * Props:
 *   tone   — 'success' | 'warning' | 'danger' | 'info' | 'neutral' |
 *            'inactive' | custom (auto-maps common stage names below)
 *   label  — display text (optional; children also accepted)
 *   size   — 'sm' (10px) | 'md' (11px, default)
 *
 * Example:
 *   <StatusBadge tone="success" label="Won" />
 *   <StatusBadge tone="warning">In Progress</StatusBadge>
 */

const TONES = {
  success: { bg: '#defbe6', fg: '#0e6027' }, // IBM Carbon green-10 / green-70
  warning: { bg: '#fef3c7', fg: '#92400e' }, // amber
  danger: { bg: '#fee2e2', fg: '#991b1b' }, // red
  info: { bg: '#dbeafe', fg: '#1e40af' }, // blue
  neutral: { bg: '#e8e8e8', fg: '#525252' }, // gray
  inactive: { bg: '#f4f4f4', fg: '#8d8d8d' }, // muted gray
  progress: { bg: '#dbeafe', fg: '#1e40af' }, // alias
  scheduled: { bg: '#fef3c7', fg: '#92400e' }, // alias
  blocked: { bg: '#fee2e2', fg: '#991b1b' }, // alias
  pending: { bg: '#fef9c3', fg: '#854d0e' },
  won: { bg: '#defbe6', fg: '#0e6027' },
  lost: { bg: '#fee2e2', fg: '#991b1b' },
};

const SIZES = {
  sm: { fontSize: 10, padding: '2px 8px' },
  md: { fontSize: 11, padding: '3px 10px' },
};

export default function StatusBadge({ tone = 'neutral', label, size = 'md', children }) {
  const palette = TONES[tone] || TONES.neutral;
  const dim = SIZES[size] || SIZES.md;
  return (
    <span
      style={{
        display: 'inline-block',
        background: palette.bg,
        color: palette.fg,
        fontSize: dim.fontSize,
        padding: dim.padding,
        fontWeight: 600,
        borderRadius: 10,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {label ?? children}
    </span>
  );
}
