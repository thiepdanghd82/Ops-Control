/**
 * ImportLegacySection — Settings → Import data từ Ops Control v1.0
 *
 * Use case: user vừa cài fresh DMG v1.1, app rỗng. Họ đã có folder
 * data từ bản v1.0 chạy trước đó (trên cùng máy hoặc network share).
 * Section này cho phép chọn folder + import 1-click.
 *
 * Flow:
 *   1. Click "Chọn folder..." → folder picker
 *   2. App scan folder → hiển thị summary (Library subfolders + sizes)
 *   3. User confirm → app copy + show progress
 *   4. Toast "Import thành công, vui lòng khởi động lại app để load DB mới"
 *
 * Safety:
 *   - Skip Users/ + totp/ → giữ login + 2FA hiện tại
 *   - Backup ops.db trước khi overwrite
 *   - Re-validate source trước khi execute (chống TOCTOU)
 */

import React, { useState } from 'react';
import desktop from '../../../services/desktopBridge';
import './ImportLegacySection.css';

export default function ImportLegacySection() {
  const [pickedPath, setPickedPath] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  // Web mode banner
  if (!desktop.isAvailable) {
    return (
      <div className="imp-section">
        <div className="imp-banner-info">
          <h3>Import data từ Ops Control v1.0</h3>
          <p>
            Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>. Bản web không có quyền truy
            cập folder ngoài (browser sandbox).
          </p>
        </div>
      </div>
    );
  }

  const pick = async () => {
    setError('');
    setScanResult(null);
    setImportResult(null);
    try {
      const r = await desktop.import.pickFolder({});
      if (r.canceled) return;
      setPickedPath(r.path);
      const scan = await desktop.import.scanFolder(r.path);
      if (!scan.ok) {
        setError(`Folder không hợp lệ: ${scan.error}${scan.detail ? ' — ' + scan.detail : ''}`);
        return;
      }
      setScanResult(scan);
    } catch (err) {
      setError(err.message);
    }
  };

  const execute = async () => {
    if (!pickedPath || !scanResult?.ok) return;
    if (
      !confirm(
        `Import ${scanResult.totalImportMB} MB data từ:\n\n${pickedPath}\n\n` +
          `App sẽ:\n` +
          `• Copy ${scanResult.summary.filter((s) => !s.skip).length} Library subfolders\n` +
          `• Replace ops.db hiện tại (đã backup tự động)\n` +
          `• KHÔNG overwrite Users + TOTP (giữ login hiện tại)\n\n` +
          `Continue?`
      )
    )
      return;

    setImporting(true);
    setError('');
    try {
      const r = await desktop.import.execute(pickedPath);
      setImportResult(r);
      if (!r.ok) {
        setError(`Import có lỗi: ${r.errors.length} errors`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const restart = async () => {
    await desktop.app.relaunch();
  };

  return (
    <div className="imp-section">
      <h2 className="imp-title">Import data từ Ops Control v1.0</h2>
      <p className="imp-subtitle">
        Copy Library + ops.db từ folder v1.0 cũ sang app này. Giữ nguyên login + 2FA hiện tại.
      </p>

      <div className="imp-card">
        <h3 className="imp-card-title">📁 Bước 1 — Chọn folder source</h3>
        <p className="imp-hint">
          Pick folder <code>server/data/</code> của bản v1.0 (vd:{' '}
          <code>/Volumes/Macintosh Data/.../Ops Control/server/data/</code>). Folder phải chứa
          subfolder <code>Library/</code> và file <code>ops.db</code>.
        </p>
        <div className="imp-actions">
          <button className="op-btn op-btn-primary" onClick={pick} disabled={importing}>
            Chọn folder...
          </button>
          {pickedPath && (
            <span className="imp-picked">
              <b>Đã chọn:</b> <code>{pickedPath}</code>
            </span>
          )}
        </div>
      </div>

      {error && <div className="imp-result imp-err">✗ {error}</div>}

      {scanResult?.ok && (
        <div className="imp-card">
          <h3 className="imp-card-title">📊 Bước 2 — Preview {scanResult.totalImportMB} MB</h3>
          <table className="imp-table">
            <thead>
              <tr>
                <th>Folder / File</th>
                <th>Files</th>
                <th>Size</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {scanResult.summary.map((s) => (
                <tr key={s.name} className={s.skip ? 'imp-row-skip' : ''}>
                  <td>
                    <code>Library/{s.name}/</code>
                  </td>
                  <td>{s.skip ? '—' : s.files}</td>
                  <td>{s.skip ? '—' : `${s.sizeMB} MB`}</td>
                  <td>
                    {s.skip ? (
                      <span className="imp-tag imp-tag-skip">SKIP — {s.reason}</span>
                    ) : (
                      <span className="imp-tag imp-tag-copy">COPY</span>
                    )}
                  </td>
                </tr>
              ))}
              {scanResult.opsDbInfo && (
                <tr className={!scanResult.opsDbInfo.schemaValid ? 'imp-row-warn' : ''}>
                  <td>
                    <code>ops.db</code>
                  </td>
                  <td>{scanResult.opsDbInfo.tableCount || 1} tables</td>
                  <td>{scanResult.opsDbInfo.sizeMB} MB</td>
                  <td>
                    {scanResult.opsDbInfo.schemaValid ? (
                      <>
                        <span className="imp-tag imp-tag-copy">REPLACE</span>{' '}
                        <span className="imp-tag imp-tag-info">backup tự động</span>
                      </>
                    ) : (
                      <>
                        <span className="imp-tag imp-tag-skip">⚠ SCHEMA INVALID</span>
                        <div className="imp-schema-warn">
                          Thiếu tables:{' '}
                          <code>
                            {(scanResult.opsDbInfo.missingCoreTables || []).join(', ') ||
                              '(read error)'}
                          </code>
                          <br />
                          Folder này có thể là backup chat-only, không phải data thật. Pick folder
                          khác.
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="imp-actions">
            <button
              className="op-btn op-btn-primary imp-btn-execute"
              onClick={execute}
              disabled={importing || (scanResult.opsDbInfo && !scanResult.opsDbInfo.schemaValid)}
              title={
                scanResult.opsDbInfo && !scanResult.opsDbInfo.schemaValid
                  ? 'Schema ops.db không hợp lệ — pick folder khác'
                  : ''
              }
            >
              {importing
                ? 'Đang copy...'
                : scanResult.opsDbInfo && !scanResult.opsDbInfo.schemaValid
                  ? '⚠ Schema invalid — pick folder khác'
                  : `Bắt đầu import (${scanResult.totalImportMB} MB)`}
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className={`imp-card ${importResult.ok ? 'imp-card-success' : 'imp-card-error'}`}>
          <h3 className="imp-card-title">
            {importResult.ok ? '✅ Bước 3 — Import thành công' : '⚠️ Import có lỗi'}
          </h3>
          <ul className="imp-result-list">
            <li>
              Copied: <b>{importResult.copied.length}</b> items
            </li>
            <li>
              Skipped (preserve login): <b>{importResult.skipped.length}</b> items
            </li>
            <li>
              Errors: <b>{importResult.errors.length}</b>
            </li>
            {importResult.backupTaken && (
              <li>
                Backup ops.db cũ: <code>{importResult.backupTaken}</code>
              </li>
            )}
          </ul>
          {importResult.errors.length > 0 && (
            <details className="imp-errors-detail">
              <summary>Xem lỗi ({importResult.errors.length})</summary>
              <ul>
                {importResult.errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.step}</code>: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {importResult.ok && (
            <div className="imp-actions">
              <button className="op-btn op-btn-primary" onClick={restart}>
                ↻ Khởi động lại app để load data mới
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
