/**
 * ImportWizard — three-step CSV/XLSX import dialog.
 *
 * Stage 1 (Upload):   pick file → server parses + auto-maps headers,
 *                     returns { sample, mapping, diff } and a token.
 * Stage 2 (Review):   show validation report (added / updated / unchanged
 *                     / removed-if-replace, duplicates, type issues),
 *                     plus the column-mapping table with override dropdowns.
 * Stage 3 (Commit):   pick mode (upsert | replace | append), enter
 *                     reason, click Commit. Server applies the staged
 *                     data using the token, audits, and reports stats.
 *
 * Driven entirely by the dataset registry on the server, so adding a
 * new tab needs no client-side changes here.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Modal from './Modal';
import { importWizardApi } from '../../services/api';
import './ImportWizard.css';

const MODE_LABELS = {
  upsert: {
    label: 'Upsert (recommended)',
    help: 'Update rows that match the natural key; add the rest. Existing rows not in the upload are kept untouched.',
  },
  replace: {
    label: 'Replace all (xoá toàn bộ dữ liệu cũ)',
    help: 'Drop the entire current dataset and replace with the upload. Use only for full re-imports. The current data is auto-backed up first.',
  },
  append: {
    label: 'Append',
    help: 'Add the new rows after existing ones with no key check. May create duplicates — use only when you know the upload contains only new rows.',
  },
};

export default function ImportWizard({
  open,
  onClose,
  datasetKey,
  datasetLabel,
  onCommitted, // called after successful commit; receives { stats }
}) {
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null);

  const [preview, setPreview] = useState(null); // server preview response
  const [overrides, setOverrides] = useState({}); // { colIdx: 'CanonicalName' | '__skip__' }
  const [mode, setMode] = useState('upsert');
  const [reason, setReason] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false); // replace-mode guard
  const [commitStats, setCommitStats] = useState(null);

  // Reset on close
  useEffect(() => {
    if (open) return;
    setStage(1);
    setBusy(false);
    setError('');
    setWarning('');
    setFile(null);
    setSheet(null);
    setPreview(null);
    setOverrides({});
    setMode('upsert');
    setReason('');
    setConfirmReplace(false);
    setCommitStats(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  const runPreview = useCallback(
    async (chosenFile, chosenSheet, chosenOverrides) => {
      setBusy(true);
      setError('');
      setWarning('');
      try {
        const res = await importWizardApi.preview(chosenFile, datasetKey, {
          sheet: chosenSheet || null,
          overrides:
            chosenOverrides && Object.keys(chosenOverrides).length ? chosenOverrides : null,
        });
        setPreview(res);
        // Default the sheet picker to the server's AUTO-SELECTED best sheet
        // (highest header match), not the first sheet. Operator can override.
        if (!chosenSheet && res.meta?.sheets?.length > 0) setSheet(res.meta.sheet);
        // Sheet-mismatch warning: if the shown sheet maps fewer than half the
        // dataset's canonical columns, the operator likely needs a different
        // sheet. Server already picked the best sheet, so this fires when even
        // the best is a poor match, or after a manual switch to a bad sheet.
        const mapped = Object.keys(res.headers?.mapping || {}).length;
        const total = res.dataset?.canonicalHeaders?.length || 0;
        const multiSheet = (res.meta?.sheets?.length || 0) > 1;
        if (multiSheet && total && mapped < Math.ceil(total / 2)) {
          setWarning(
            `This sheet doesn't look like ${res.dataset?.label || 'this'} data — showing "${res.meta?.sheet}" (${mapped}/${total} columns matched). Pick a different sheet if this is wrong.`
          );
        } else if (res.coercion?.totalIssues > 0) {
          // Warn (but don't block) when there are coercion issues
          setWarning(
            `${res.coercion.totalIssues} cell(s) had type-coercion issues — see the Issues panel.`
          );
        }
        setStage(2);
      } catch (err) {
        const body = err.body || {};
        if (body.error === 'missing_required_headers') {
          setError(body.hint || `Missing required columns: ${(body.missing || []).join(', ')}`);
        } else {
          setError(err.message || 'Preview failed');
        }
        // Keep stage at 1 so user can fix
        setStage(1);
      } finally {
        setBusy(false);
      }
    },
    [datasetKey]
  );

  const handleFileChosen = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setOverrides({});
      setSheet(null);
      runPreview(f, null, null);
    },
    [runPreview]
  );

  const handleSheetChange = useCallback(
    (s) => {
      setSheet(s);
      if (file) runPreview(file, s, overrides);
    },
    [file, overrides, runPreview]
  );

  const handleOverrideChange = useCallback(
    (colIdx, canonical) => {
      const next = { ...overrides, [colIdx]: canonical };
      if (canonical === '__auto__') delete next[colIdx];
      setOverrides(next);
    },
    [overrides]
  );

  const handleApplyOverrides = useCallback(() => {
    if (file) runPreview(file, sheet, overrides);
  }, [file, sheet, overrides, runPreview]);

  const handleCommit = useCallback(async () => {
    if (!preview?.token) return;
    setBusy(true);
    setError('');
    try {
      const res = await importWizardApi.commit(preview.token, mode, reason);
      setCommitStats(res.stats || {});
      setStage(4); // success screen
      onCommitted?.(res.stats || {});
    } catch (err) {
      // Token consumed even on failure (single-use). User must redo preview.
      setError((err.body?.error || err.message) + ' — please re-upload to continue.');
    } finally {
      setBusy(false);
    }
  }, [preview, mode, reason, onCommitted]);

  // Replace wipes the whole dataset — gate it behind an explicit confirm.
  // (The server still auto-backs-up before any write; this is the human guard.)
  const requestCommit = useCallback(() => {
    if (mode === 'replace') {
      setConfirmReplace(true);
      return;
    }
    handleCommit();
  }, [mode, handleCommit]);

  // Derived: has-blocking-issues?
  const blocking = useMemo(() => {
    if (!preview) return [];
    const list = [];
    if (preview.diff?.counts?.duplicates > 0) {
      list.push(
        `${preview.diff.counts.duplicates} duplicate natural-key row(s) inside the upload — pick "Upsert" to keep the LAST occurrence, or fix the file.`
      );
    }
    return list;
  }, [preview]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        severity="info"
        closable={!busy}
        dismissable={!busy}
      >
        <Modal.Header
          title={`Import — ${datasetLabel || datasetKey}`}
          subtitle={`Step ${stage <= 3 ? stage : 3} of 3 ${stage === 4 ? '· Done' : ''}`}
        />

        <Modal.Body className="iw-body">
          {error && (
            <div className="iw-banner iw-banner-err" role="alert">
              {error}
            </div>
          )}
          {warning && stage !== 4 && <div className="iw-banner iw-banner-warn">{warning}</div>}

          {stage === 1 && (
            <Stage1Upload
              datasetKey={datasetKey}
              onPick={() => fileRef.current?.click()}
              busy={busy}
            />
          )}

          {stage === 2 && preview && (
            <Stage2Review
              preview={preview}
              sheet={sheet}
              overrides={overrides}
              onSheetChange={handleSheetChange}
              onOverrideChange={handleOverrideChange}
              onApplyOverrides={handleApplyOverrides}
              blocking={blocking}
            />
          )}

          {stage === 3 && preview && (
            <Stage3Commit
              preview={preview}
              mode={mode}
              setMode={setMode}
              reason={reason}
              setReason={setReason}
            />
          )}

          {stage === 4 && commitStats && <Stage4Success stats={commitStats} />}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="iw-hidden-file-input"
            onChange={handleFileChosen}
          />
        </Modal.Body>

        <Modal.Footer>
          {stage === 1 && (
            <>
              <button className="op-btn op-btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="op-btn op-btn-primary"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {busy ? 'Parsing…' : 'Choose File'}
              </button>
            </>
          )}
          {stage === 2 && (
            <>
              <button
                className="op-btn op-btn-ghost"
                onClick={() => {
                  setStage(1);
                  setPreview(null);
                }}
              >
                Back
              </button>
              <button className="op-btn op-btn-primary" onClick={() => setStage(3)} disabled={busy}>
                Continue
              </button>
            </>
          )}
          {stage === 3 && (
            <>
              <button className="op-btn op-btn-ghost" onClick={() => setStage(2)} disabled={busy}>
                Back
              </button>
              <button
                className="op-btn op-btn-primary iw-commit-btn"
                onClick={requestCommit}
                disabled={busy}
              >
                {busy ? 'Committing…' : `Commit · ${MODE_LABELS[mode]?.label}`}
              </button>
            </>
          )}
          {stage === 4 && (
            <button className="op-btn op-btn-primary" onClick={onClose}>
              Close
            </button>
          )}
        </Modal.Footer>
      </Modal>

      {/* Replace-mode confirm — destructive, so make the operator opt in once
        more. The server auto-backs-up before the wipe, but this is the human
        stop. */}
      <Modal
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        size="sm"
        severity="danger"
      >
        <Modal.Header title="Replace all data? · Xoá toàn bộ dữ liệu cũ?" />
        <Modal.Body>
          <p>
            This will <strong>delete every existing {datasetLabel || datasetKey} row</strong> and
            replace it with the {preview?.sample?.totalRows ?? ''} uploaded row(s).
            {preview?.diff?.counts?.removedIfReplace > 0 && (
              <> {preview.diff.counts.removedIfReplace} current row(s) will be removed.</>
            )}
          </p>
          <p>
            Việc này sẽ <strong>xoá toàn bộ dữ liệu hiện có</strong> và thay bằng file vừa tải lên.
            Bản hiện tại được tự động sao lưu trước khi ghi đè (
            <code>*_backup_&lt;ts&gt;.json</code>).
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            className="op-btn op-btn-ghost"
            onClick={() => setConfirmReplace(false)}
            disabled={busy}
          >
            Cancel · Huỷ
          </button>
          <button
            className="op-btn op-btn-danger"
            onClick={() => {
              setConfirmReplace(false);
              handleCommit();
            }}
            disabled={busy}
          >
            {busy ? 'Committing…' : 'Replace all · Xoá & nhập'}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAGE 1 — Upload
// ─────────────────────────────────────────────────────────────────
function Stage1Upload({ datasetKey, onPick, busy }) {
  const tplUrl = importWizardApi.templateUrl(datasetKey);
  const exportCsvUrl = importWizardApi.exportUrl(datasetKey, 'csv');
  const exportXlsxUrl = importWizardApi.exportUrl(datasetKey, 'xlsx');
  return (
    <div className="iw-stage1">
      <div
        className="iw-drop"
        role="button"
        tabIndex={0}
        onClick={busy ? undefined : onPick}
        onKeyDown={(e) => {
          if (!busy && (e.key === 'Enter' || e.key === ' ')) onPick();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="48"
          height="48"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
          <path d="M3 21h18" />
        </svg>
        <div className="iw-drop-title">Click to choose a CSV or XLSX file</div>
        <div className="iw-drop-help">
          Up to 50 MB · header row required · auto-detects delimiter and Excel sheets
        </div>
      </div>
      <div className="iw-roundtrip">
        <a className="op-btn op-btn-ghost" href={tplUrl}>
          📄 Download Template
        </a>
        {/* CSV first — much smaller than XLSX and re-imports cleanly (a full
            BOM export is ~24 MB as xlsx vs a few MB as csv). */}
        <a className="op-btn op-btn-ghost" href={exportCsvUrl}>
          ⬇ Export CSV (re-importable)
        </a>
        <a className="op-btn op-btn-ghost" href={exportXlsxUrl}>
          ⬇ Export XLSX
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAGE 2 — Review (mapping + diff + issues)
// ─────────────────────────────────────────────────────────────────
function Stage2Review({
  preview,
  sheet,
  overrides,
  onSheetChange,
  onOverrideChange,
  onApplyOverrides,
  blocking,
}) {
  const { dataset, headers, sample, diff, coercion, file, meta } = preview;
  const canonical = dataset.canonicalHeaders;

  return (
    <div className="iw-stage2">
      {/* Source summary + sheet picker */}
      <div className="iw-source">
        <div>
          <strong>Source:</strong> {file?.name}{' '}
          <span className="iw-mono">({(file?.size / 1024).toFixed(1)} KB)</span>
        </div>
        <div>
          <strong>Detected:</strong> {sample.totalRows} rows · {headers.raw.length} columns
        </div>
        {meta?.sheets?.length > 1 && (
          <label className="iw-sheet-pick">
            <span>Sheet:</span>
            <select value={sheet || meta.sheet} onChange={(e) => onSheetChange(e.target.value)}>
              {meta.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Diff summary cards */}
      <div className="iw-diff">
        <DiffCard label="Added" count={diff.counts.added} tone="add" />
        <DiffCard label="Updated" count={diff.counts.updated} tone="upd" />
        <DiffCard label="Unchanged" count={diff.counts.unchanged} tone="noop" />
        <DiffCard label="Removed if Replace" count={diff.counts.removedIfReplace} tone="rm" />
        <DiffCard label="Duplicates in file" count={diff.counts.duplicates} tone="dup" />
      </div>

      {blocking.length > 0 && (
        <div className="iw-banner iw-banner-warn">
          {blocking.map((b, i) => (
            <div key={i}>{b}</div>
          ))}
        </div>
      )}

      {/* Type-coercion issues */}
      {coercion?.totalIssues > 0 && (
        <details className="iw-issues" open>
          <summary>{coercion.totalIssues} cell(s) failed type coercion (raw values kept)</summary>
          <table className="iw-table iw-issues-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Column</th>
                <th>Raw</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {coercion.issues.map((i, k) => (
                <tr key={k}>
                  <td>{i.row + 2}</td>
                  <td>{i.col}</td>
                  <td className="iw-mono">{String(i.raw)}</td>
                  <td>{i.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {coercion.totalIssues > coercion.issues.length && (
            <div className="iw-help">…and {coercion.totalIssues - coercion.issues.length} more</div>
          )}
        </details>
      )}

      {/* Column mapping table */}
      <details className="iw-mapping" open>
        <summary>
          Column mapping ({Object.keys(headers.mapping).length} mapped, {headers.unmapped.length}{' '}
          unmapped)
        </summary>
        <table className="iw-table">
          <thead>
            <tr>
              <th>Column #</th>
              <th>Source Header</th>
              <th>Mapped to (canonical)</th>
            </tr>
          </thead>
          <tbody>
            {headers.raw.map((h, i) => {
              const auto = headers.normalised[i];
              const override = overrides[i];
              const value = override || auto || '__auto__';
              return (
                <tr key={i}>
                  <td className="iw-mono">{i + 1}</td>
                  <td>{h || <em className="iw-help">(blank)</em>}</td>
                  <td>
                    <select value={value} onChange={(e) => onOverrideChange(i, e.target.value)}>
                      <option value="__auto__">{auto ? `Auto: ${auto}` : '— not mapped —'}</option>
                      <option value="__skip__">— skip this column —</option>
                      {canonical.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="iw-mapping-actions">
          <button className="op-btn op-btn-secondary" onClick={onApplyOverrides}>
            Re-validate with overrides
          </button>
        </div>
      </details>

      {/* Sample rows */}
      <details className="iw-sample">
        <summary>
          Sample rows (first {sample.rows.length} of {sample.totalRows})
        </summary>
        <div className="iw-table-scroll">
          <table className="iw-table iw-sample-table">
            <thead>
              <tr>
                {sample.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="iw-mono">
                      {String(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function DiffCard({ label, count, tone }) {
  return (
    <div className={`iw-diff-card iw-diff-${tone}`}>
      <div className="iw-diff-count">{count}</div>
      <div className="iw-diff-label">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAGE 3 — Commit (mode + reason)
// ─────────────────────────────────────────────────────────────────
function Stage3Commit({ preview, mode, setMode, reason, setReason }) {
  const dataset = preview.dataset;
  return (
    <div className="iw-stage3">
      <div className="iw-step3-summary">
        <strong>About to commit {preview.sample.totalRows} row(s)</strong> to{' '}
        <span className="iw-pill">{dataset.label}</span>
        <div className="iw-help">
          Natural key: <code>{dataset.naturalKey.join(' + ')}</code>
        </div>
      </div>

      <fieldset className="iw-mode-group">
        <legend>Import Mode</legend>
        {Object.entries(MODE_LABELS).map(([key, info]) => (
          <label key={key} className={`iw-mode-choice ${mode === key ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="iw-mode"
              value={key}
              checked={mode === key}
              onChange={() => setMode(key)}
            />
            <div>
              <div className="iw-mode-label">{info.label}</div>
              <div className="iw-mode-help">{info.help}</div>
            </div>
          </label>
        ))}
      </fieldset>

      <label className="iw-reason">
        <span>Reason / change note (recorded in audit log):</span>
        <textarea
          rows={2}
          maxLength={500}
          placeholder="e.g. Apr 2026 NPI batch + 5 supplier price updates"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      {mode === 'replace' && (
        <div className="iw-banner iw-banner-warn">
          ⚠ Replace will drop all{' '}
          {preview.diff.counts.removedIfReplace +
            preview.diff.counts.unchanged +
            preview.diff.counts.updated}{' '}
          existing row(s) and write only the {preview.sample.totalRows} from this file. Backup is
          created automatically.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STAGE 4 — Success
// ─────────────────────────────────────────────────────────────────
function Stage4Success({ stats }) {
  return (
    <div className="iw-stage4">
      <div className="iw-success-icon" aria-hidden="true">
        <svg
          viewBox="0 0 64 64"
          width="56"
          height="56"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="32" cy="32" r="28" />
          <path d="m20 32 8 8 16-16" />
        </svg>
      </div>
      <div className="iw-success-title">Import committed.</div>
      <div className="iw-success-detail">
        <div>
          {stats.rowsImported} row(s) committed in <strong>{stats.mode}</strong> mode.
        </div>
        <div>
          Total rows in {stats.datasetLabel}: <strong>{stats.totalAfter}</strong>
        </div>
        {stats.backup && (
          <div>
            Pre-import backup: <code>{stats.backup}</code>
          </div>
        )}
        {stats.reason && <div className="iw-help">Reason: {stats.reason}</div>}
      </div>
    </div>
  );
}
