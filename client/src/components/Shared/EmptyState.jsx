/**
 * EmptyState — professional no-data placeholder.
 *
 * Replaces the "No data" italic text scattered across tabs. Uses IBM Carbon
 * tokens for typography + color. Accepts optional action to guide the user
 * to the next step ("No materials yet. Import from library").
 *
 * Props:
 *   icon      — ReactNode (emoji, SVG, lucide icon)
 *   title     — required, main headline
 *   hint      — optional secondary line
 *   action    — optional JSX (usually a button)
 *   compact   — tighter padding for use inside table cells
 */
export default function EmptyState({ icon, title, hint, action, compact = false }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 8,
        padding: compact ? '24px 16px' : '56px 24px',
        color: '#525252',
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
        textAlign: 'center',
      }}
    >
      {icon ? (
        <div style={{ fontSize: 32, opacity: 0.55, marginBottom: 4 }}>{icon}</div>
      ) : null}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#161616' }}>{title}</div>
      {hint ? (
        <div style={{ fontSize: 12, color: '#6f6f6f', maxWidth: 360, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}
