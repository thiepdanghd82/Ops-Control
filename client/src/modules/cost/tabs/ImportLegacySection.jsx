/**
 * ImportLegacySection — Settings → Import data
 *
 * Use case: fresh-install DMG with empty data. Operator points the app at
 * an existing Ops Control data folder (Library/ + ops.db) — same machine
 * or network share — and one-click imports the lot.
 *
 * Flow:
 *   1. Click "Choose folder…" → folder picker
 *   2. App scans → preview Library subfolders + ops.db size + table count
 *   3. Operator confirms → atomic copy + progress
 *   4. Restart prompt — app reloads against the new data
 *
 * Safety:
 *   - Skips Users/ + totp/ — keeps the local login + 2FA enrollment
 *   - Backs up the existing ops.db before overwrite
 *   - Re-scans source folder right before execute (TOCTOU guard)
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
          <h3>Import Data from server</h3>
          <p>
            <b>EN ·</b> This tab is only available in the <b>Ops Control Desktop App</b>.
            The browser-based web client cannot reach external folders (sandbox restriction).
          </p>
          <p>
            <b>VN ·</b> Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>.
            Bản web không có quyền truy cập folder ngoài (giới hạn sandbox của trình duyệt).
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
        setError(`Invalid folder / Folder không hợp lệ: ${scan.error}${scan.detail ? ' — ' + scan.detail : ''}`);
        return;
      }
      setScanResult(scan);
    } catch (err) {
      setError(err.message);
    }
  };

  const execute = async () => {
    if (!pickedPath || !scanResult?.ok) return;
    if (!confirm(
      `Import ${scanResult.totalImportMB} MB of data from / từ:\n\n${pickedPath}\n\n` +
      `The app will / App sẽ:\n` +
      `• Copy ${scanResult.summary.filter((s) => !s.skip).length} Library subfolders\n` +
      `• Replace the current ops.db (auto-backup taken first)\n` +
      `   Thay thế ops.db hiện tại (tự động backup trước)\n` +
      `• PRESERVE Users + TOTP — your login & 2FA stay\n` +
      `   GIỮ Users + TOTP — login & 2FA hiện tại không đổi\n\n` +
      `Continue? / Tiếp tục?`
    )) return;

    setImporting(true);
    setError('');
    try {
      const r = await desktop.import.execute(pickedPath);
      setImportResult(r);
      if (!r.ok) {
        setError(`Import finished with errors / Import có lỗi: ${r.errors.length} error(s)`);
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
      <h2 className="imp-title">Import Data from server</h2>
      <p className="imp-subtitle">
        <b>EN ·</b> Bring an existing Ops Control data folder (Library + ops.db)
        into this fresh install. The current login &amp; 2FA stay untouched.
        <br/>
        <b>VN ·</b> Đưa thư mục data Ops Control hiện có (Library + ops.db) vào
        bản cài mới này. Login &amp; 2FA hiện tại được giữ nguyên.
      </p>

      {/* S-IMPORT-DOC (2026-05-06) — explainer block: clarify what this
          imports, when to use it, and what stays untouched. Operators
          on a brand-new desktop install often confuse this with "Restore
          backup" — they're different surfaces. */}
      <div className="imp-explainer" style={{
        background: '#edf5ff', border: '1px solid #a6c8ff', padding: '12px 14px',
        borderRadius: 4, fontSize: 13, lineHeight: 1.55, color: '#0043ce', marginBottom: 16,
      }}>
        <div style={{ marginBottom: 6 }}><b>What is this data? / Data này là gì?</b></div>
        <div style={{ marginBottom: 4 }}>
          <b>EN ·</b> Ops Control stores everything under one <code>server/data/</code> folder:
          <ul style={{ margin: '4px 0 4px 20px', padding: 0 }}>
            <li><code>Library/</code> — JSON files: quotes, materials, rate tables, RFQ tracker, sample tracker, ink calc, finance, design tools, permission groups, etc.</li>
            <li><code>ops.db</code> — SQLite database: the same quotes mirrored for fast queries, plus chat messages and audit history.</li>
            <li><code>Library/Users/</code> + <code>Library/totp/</code> — local user accounts &amp; 2FA enrollments (these stay on THIS machine, not copied).</li>
          </ul>
          Use this tab when you've just installed the desktop app on a new machine
          and want to point it at an existing data folder (your old machine, a colleague's,
          or a network share) instead of starting from scratch.
        </div>
        <div style={{ marginTop: 8 }}>
          <b>VN ·</b> Ops Control lưu tất cả trong 1 folder <code>server/data/</code>:
          <ul style={{ margin: '4px 0 4px 20px', padding: 0 }}>
            <li><code>Library/</code> — file JSON: báo giá, vật tư, rate, RFQ tracker, sample, ink calc, finance, design tools, permission groups, v.v.</li>
            <li><code>ops.db</code> — database SQLite: mirror báo giá cho query nhanh, kèm tin nhắn chat &amp; audit log.</li>
            <li><code>Library/Users/</code> + <code>Library/totp/</code> — tài khoản &amp; 2FA cục bộ (KHÔNG copy, giữ lại login máy này).</li>
          </ul>
          Dùng tab này khi vừa cài app trên máy mới và muốn trỏ tới folder data
          đã có (máy cũ, máy đồng nghiệp, hoặc share network) thay vì bắt đầu trống.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic' }}>
          <b>Different from "Backup / Restore" / Khác với "Backup / Restore":</b> Restore
          chỉ ghi đè 14–16 dataset đã chọn từ 1 file <code>.json</code>. Tab này copy <b>toàn bộ</b>
          folder data (Library + ops.db) — dùng cho lần đầu setup máy.
          <br/>
          Restore overwrites a curated 14–16 dataset list from one <code>.json</code> backup.
          This tab copies the <b>entire</b> data folder (Library + ops.db) — for first-time machine setup.
        </div>
      </div>

      <div className="imp-card">
        <h3 className="imp-card-title">📁 Step 1 / Bước 1 — Choose source folder / Chọn folder nguồn</h3>
        <p className="imp-hint">
          <b>EN ·</b> Pick the <code>server/data/</code> folder of an existing Ops Control install
          (e.g. <code>/Volumes/Macintosh Data/.../Ops Control/server/data/</code>). It must contain
          a <code>Library/</code> subfolder and an <code>ops.db</code> file.
          <br/>
          <b>VN ·</b> Chọn folder <code>server/data/</code> của bản Ops Control hiện có
          (vd: <code>/Volumes/Macintosh Data/.../Ops Control/server/data/</code>). Folder phải có
          subfolder <code>Library/</code> và file <code>ops.db</code>.
        </p>
        <div className="imp-actions">
          <button className="op-btn op-btn-primary" onClick={pick} disabled={importing}>
            Choose folder… / Chọn folder…
          </button>
          {pickedPath && (
            <span className="imp-picked"><b>Selected / Đã chọn:</b> <code>{pickedPath}</code></span>
          )}
        </div>
      </div>

      {error && (
        <div className="imp-result imp-err">
          ✗ {error}
        </div>
      )}

      {scanResult?.ok && (
        <div className="imp-card">
          <h3 className="imp-card-title">📊 Step 2 / Bước 2 — Preview ({scanResult.totalImportMB} MB)</h3>
          <table className="imp-table">
            <thead>
              <tr>
                <th>Folder / File</th>
                <th>Files</th>
                <th>Size</th>
                <th>Status / Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {scanResult.summary.map((s) => (
                <tr key={s.name} className={s.skip ? 'imp-row-skip' : ''}>
                  <td><code>Library/{s.name}/</code></td>
                  <td>{s.skip ? '—' : s.files}</td>
                  <td>{s.skip ? '—' : `${s.sizeMB} MB`}</td>
                  <td>
                    {s.skip
                      ? <span className="imp-tag imp-tag-skip">SKIP — {s.reason}</span>
                      : <span className="imp-tag imp-tag-copy">COPY</span>}
                  </td>
                </tr>
              ))}
              {scanResult.opsDbInfo && (
                <tr className={!scanResult.opsDbInfo.schemaValid ? 'imp-row-warn' : ''}>
                  <td><code>ops.db</code></td>
                  <td>{scanResult.opsDbInfo.tableCount || 1} tables</td>
                  <td>{scanResult.opsDbInfo.sizeMB} MB</td>
                  <td>
                    {scanResult.opsDbInfo.schemaValid ? (
                      <>
                        <span className="imp-tag imp-tag-copy">REPLACE</span>{' '}
                        <span className="imp-tag imp-tag-info">auto-backup / tự động backup</span>
                      </>
                    ) : (
                      <>
                        <span className="imp-tag imp-tag-skip">⚠ SCHEMA INVALID</span>
                        <div className="imp-schema-warn">
                          Missing tables / Thiếu tables: <code>{(scanResult.opsDbInfo.missingCoreTables || []).join(', ') || '(read error)'}</code>
                          <br />
                          This folder may be a chat-only backup, not real data. Pick a different folder.
                          <br/>
                          <i>Folder này có thể là backup chat-only, không phải data thật. Chọn folder khác.</i>
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
              title={scanResult.opsDbInfo && !scanResult.opsDbInfo.schemaValid
                ? 'ops.db schema invalid — pick a different folder / pick folder khác'
                : ''}
            >
              {importing
                ? 'Copying… / Đang copy…'
                : (scanResult.opsDbInfo && !scanResult.opsDbInfo.schemaValid)
                  ? '⚠ Schema invalid — pick another folder'
                  : `Start import / Bắt đầu import (${scanResult.totalImportMB} MB)`}
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className={`imp-card ${importResult.ok ? 'imp-card-success' : 'imp-card-error'}`}>
          <h3 className="imp-card-title">
            {importResult.ok
              ? '✅ Step 3 / Bước 3 — Import successful / Import thành công'
              : '⚠️ Import finished with errors / Import có lỗi'}
          </h3>
          <ul className="imp-result-list">
            <li>Copied / Đã copy: <b>{importResult.copied.length}</b> items</li>
            <li>Skipped (preserve login) / Bỏ qua (giữ login): <b>{importResult.skipped.length}</b> items</li>
            <li>Errors / Lỗi: <b>{importResult.errors.length}</b></li>
            {importResult.backupTaken && (
              <li>Old ops.db backup / Backup ops.db cũ: <code>{importResult.backupTaken}</code></li>
            )}
          </ul>
          {importResult.errors.length > 0 && (
            <details className="imp-errors-detail">
              <summary>View errors / Xem lỗi ({importResult.errors.length})</summary>
              <ul>
                {importResult.errors.map((e, i) => (
                  <li key={i}><code>{e.step}</code>: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
          {importResult.ok && (
            <div className="imp-actions">
              <button className="op-btn op-btn-primary" onClick={restart}>
                ↻ Restart app to load new data / Khởi động lại app để load data mới
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
