/**
 * QuoteVersionDiff — read-only panel showing field-level changes between
 * two saved versions of a quote. Lazy-loaded from Quote History via a
 * "Version history" action; server does the diff computation.
 *
 * Props:
 *   quoteId     — integer
 *   fromVersion — integer (older version)
 *   toVersion   — integer (newer version; null = latest)
 *   onClose     — callback to close the panel
 */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import Modal from './Modal';

function fmtValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  }
  if (typeof v === 'number') {
    // Preserve full precision in diff display — this is audit-style view.
    return String(v);
  }
  return String(v);
}

function opBadge(op) {
  const palette = {
    added:   { bg: '#defbe6', fg: '#0e6027', label: '+ added' },
    removed: { bg: '#fee2e2', fg: '#991b1b', label: '− removed' },
    changed: { bg: '#dbeafe', fg: '#1e40af', label: '≠ changed' },
  }[op] || { bg: '#e8e8e8', fg: '#525252', label: op };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
      padding: '2px 8px', borderRadius: 10,
      background: palette.bg, color: palette.fg,
    }}>{palette.label}</span>
  );
}

export default function QuoteVersionDiff({ quoteId, fromVersion, toVersion, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect --
     Standard cancelled-flag pattern for async fetch inside a component
     effect. React 19's stricter rule flags the set-state-in-then branch
     but the flag guard prevents cascading renders on stale promises. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    const qs = toVersion != null ? `?from=${fromVersion}&to=${toVersion}` : `?from=${fromVersion}`;
    api.get(`/shared/quotes/${quoteId}/versions/diff${qs}`)
      .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e.message || 'Failed to load diff'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [quoteId, fromVersion, toVersion]);

  const subtitle = data
    ? `v${data.from.version_num} → v${data.to.version_num} · ${data.change_count} change${data.change_count === 1 ? '' : 's'}`
    : undefined;

  return (
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="qvd-title">
      <Modal.Header id="qvd-title" title={`Quote #${quoteId} · Version diff`} subtitle={subtitle} />
      <Modal.Body className="flush">
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: '#8d8d8d' }}>Loading diff…</div>
          )}
          {err && (
            <div style={{ padding: 20, color: '#991b1b', fontSize: 12 }}>{err}</div>
          )}
          {data && data.changes.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#525252', fontSize: 13 }}>
              No field-level changes between these two versions.
            </div>
          )}
          {data && data.changes.length > 0 && (
            <table style={{
              width: '100%', borderCollapse: 'separate', borderSpacing: 0,
              fontSize: 12, color: '#161616',
            }}>
              <thead>
                <tr style={{ background: '#f4f4f4' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#525252', letterSpacing: 0.4, borderBottom: '2px solid #e0e0e0' }}>Field</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#525252', letterSpacing: 0.4, borderBottom: '2px solid #e0e0e0', width: 90 }}>Change</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#525252', letterSpacing: 0.4, borderBottom: '2px solid #e0e0e0' }}>From</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#525252', letterSpacing: 0.4, borderBottom: '2px solid #e0e0e0' }}>To</th>
                </tr>
              </thead>
              <tbody>
                {data.changes.map((c, i) => (
                  <tr key={`${c.path}::${c.op}`} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e8e8e8', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>{c.path}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e8e8e8' }}>{opBadge(c.op)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e8e8e8', fontVariantNumeric: 'tabular-nums' }}>{c.op === 'added' ? '' : fmtValue(c.from)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e8e8e8', fontVariantNumeric: 'tabular-nums' }}>{c.op === 'removed' ? '' : fmtValue(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
