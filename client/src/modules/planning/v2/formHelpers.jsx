/**
 * MES-1.7 — shared form helpers for modals.
 *
 * Extracted out of CreateWorkOrderModal + AddOperationModal so each
 * modal file stays under the 120-LOC per-file cap and the
 * RFC-7807-errors → field-map mapping doesn't drift between them.
 */

export function Field({ label, required, err, children }) {
  return (
    <label className={`wo-form-field${err ? ' wo-form-field-err' : ''}`}>
      <span className="wo-form-label">
        {label} {required ? <span className="wo-modal-required">*</span> : null}
      </span>
      {children}
      {err ? <span className="wo-form-err">{err}</span> : null}
    </label>
  );
}

/**
 * Convert an RFC-7807 error caught from api.js into a {field → code}
 * map for inline display. Falls back to a `_root` key when the body
 * has no per-field `errors[]`. Co-located with `Field` because the
 * pair always travels together — the cost of one extra file outweighs
 * Fast-Refresh's component-purity preference.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function mapServerErrors(e) {
  if (e?.body?.errors) {
    const map = {};
    for (const er of e.body.errors) if (er.field) map[er.field] = er.code || 'invalid';
    return map;
  }
  return { _root: e?.body?.detail || e?.message || 'error' };
}
