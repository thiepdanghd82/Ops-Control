/**
 * ConflictModal — friendly UI for HTTP 409 optimistic-lock conflict.
 *
 * Why: server returns 409 when 2 users save same quote out of order.
 * Default error toast "Save failed" doesn't tell user what to do.
 * This modal offers 3 clear options:
 *   1. ↻ Reload server version (RECOMMENDED — preserves other user's work)
 *   2. ⚠ Overwrite anyway (forces our version, kills theirs)
 *   3. ✕ Cancel (keep editing, save again later)
 *
 * Default focus: Reload (safer choice, prevents data loss).
 *
 * Usage:
 *   const [conflict, setConflict] = useState(null);
 *
 *   try { await save(quote); }
 *   catch (err) {
 *     if (err.status === 409 && err.body?.current) {
 *       setConflict({ current: err.body.current, attempted: quote });
 *     } else throw err;
 *   }
 *
 *   <ConflictModal
 *     conflict={conflict}
 *     onReload={() => { reloadFromServer(); setConflict(null); }}
 *     onOverwrite={() => { saveForce(quote); setConflict(null); }}
 *     onCancel={() => setConflict(null)}
 *   />
 */

import React, { useEffect, useRef } from 'react';
import './ConflictModal.css';

export default function ConflictModal({ conflict, onReload, onOverwrite, onCancel }) {
  const reloadBtnRef = useRef(null);

  useEffect(() => {
    if (conflict && reloadBtnRef.current) {
      reloadBtnRef.current.focus();
    }
  }, [conflict]);

  // ESC closes (= cancel)
  useEffect(() => {
    if (!conflict) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [conflict, onCancel]);

  if (!conflict) return null;

  const { current, attempted, savedBy, savedAt } = conflict;
  const itemId = current?.id || attempted?.id || '?';
  const serverVersion = current?._version ?? '?';
  const ourVersion = attempted?._version ?? '?';

  return (
    <div className="conflict-scrim" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div className="conflict-modal">
        <div className="conflict-icon" aria-hidden>⚠</div>
        <h2 id="conflict-title" className="conflict-title">
          Quote #{itemId} đã bị sửa bởi người khác
        </h2>
        <p className="conflict-desc">
          Trong khi anh đang sửa, một user khác đã save lại quote này.
          {savedBy && <> Người đó: <b>{savedBy}</b>.</>}
          {savedAt && <> Lúc: <b>{new Date(savedAt).toLocaleString('vi-VN')}</b>.</>}
        </p>

        <div className="conflict-meta">
          <div>
            <span className="conflict-meta-label">Server version</span>
            <code>v{serverVersion}</code>
          </div>
          <div>
            <span className="conflict-meta-label">Anh đang gửi</span>
            <code>v{ourVersion}</code>
          </div>
        </div>

        <div className="conflict-actions">
          <button
            ref={reloadBtnRef}
            className="conflict-btn conflict-btn-primary"
            onClick={onReload}
          >
            ↻ Reload bản mới (khuyến nghị)
          </button>
          <button
            className="conflict-btn conflict-btn-danger"
            onClick={() => {
              if (confirm(
                `CẢNH BÁO: Overwrite sẽ XÓA thay đổi của user khác.\n\n` +
                `Anh chắc chắn muốn ghi đè?`,
              )) {
                onOverwrite?.();
              }
            }}
          >
            ⚠ Overwrite (mất sửa của người khác)
          </button>
          <button className="conflict-btn" onClick={onCancel}>
            Hủy (giữ form, save sau)
          </button>
        </div>

        <div className="conflict-hint">
          <b>Khuyến nghị:</b> Click <i>Reload</i> → app load bản mới từ server →
          xem thay đổi của người kia → áp dụng sửa của anh lên trên → save lại.
          <br />
          <i>Overwrite</i> chỉ dùng nếu chắc chắn sửa của người kia là sai.
        </div>
      </div>
    </div>
  );
}
