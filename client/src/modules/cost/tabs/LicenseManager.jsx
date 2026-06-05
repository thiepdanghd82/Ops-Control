// @ts-check
/**
 * License Manager — sys-only fleet view (v1.6, ships AFTER go-live).
 *
 * "Ký offline, phân phối online": this tab NEVER signs a license. It shows the
 * fleet (from heartbeats), lets the sys-admin export a per-machine request
 * (handed to the offline mint flow), and upload an already-signed license that
 * the server verifies + queues for delivery on the machine's next heartbeat.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { licenseFleetApi } from '../../../services/api';
import {
  statusBadge,
  formatDaysLeft,
  shortId,
  buildExportRequest,
  exportRequestFilename,
} from '../../../services/licenseFleetView';
import './LicenseManager.css';

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function LicenseManagerSection() {
  const [fleet, setFleet] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const uploadTargetRef = useRef(null);
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const r = await licenseFleetApi.list();
      setFleet(Array.isArray(r?.fleet) ? r.fleet : []);
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách fleet');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onExportRequest = (m) => {
    const payload = buildExportRequest(m, new Date().toISOString());
    downloadJson(payload, exportRequestFilename(m));
  };

  const onPickUpload = (m) => {
    uploadTargetRef.current = m?.installation_id || null;
    fileInputRef.current?.click();
  };

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const license = JSON.parse(await file.text());
      const r = await licenseFleetApi.upload(license, uploadTargetRef.current || undefined);
      if (r?.queued) {
        setMsg(`Đã nhận + xếp hàng license cho máy ${shortId(r.installation_id)}. Sẽ giao ở heartbeat kế tiếp.`);
        await refresh();
      } else {
        setError(`Từ chối: ${r?.reason || r?.error || 'verify_failed'}`);
      }
    } catch (err) {
      // Server verify failure comes back as a thrown error with the reason.
      setError(err?.body?.reason ? `Verify thất bại: ${err.body.reason}` : err?.message || 'Upload lỗi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="licmgr">
      <div className="licmgr-head">
        <h2>License Manager</h2>
        <button className="op-btn" onClick={refresh} disabled={busy}>
          ↻ Làm mới
        </button>
      </div>
      <p className="licmgr-sub">
        Ký offline trên máy Lead, phân phối online tại đây. Server KHÔNG bao giờ ký — chỉ verify chữ
        ký + installation_id rồi xếp hàng giao xuống máy đích ở heartbeat kế tiếp.
      </p>

      {error && <div className="licmgr-alert licmgr-alert-bad">{error}</div>}
      {msg && <div className="licmgr-alert licmgr-alert-ok">{msg}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="licmgr-hidden-input"
        onChange={onUploadFile}
      />

      {fleet == null ? (
        <div className="licmgr-empty">Đang tải…</div>
      ) : fleet.length === 0 ? (
        <div className="licmgr-empty">
          Chưa có máy nào gửi heartbeat. Máy desktop sẽ tự báo cáo khi operator đăng nhập.
        </div>
      ) : (
        <table className="licmgr-table">
          <thead>
            <tr>
              <th>Máy</th>
              <th>Installation ID</th>
              <th>Trạng thái</th>
              <th>Tier</th>
              <th>Hết hạn</th>
              <th>Còn lại</th>
              <th>Last seen</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((m) => {
              const b = statusBadge(m);
              return (
                <tr key={m.installation_id}>
                  <td>{m.hostname || '—'}</td>
                  <td className="licmgr-mono">{shortId(m.installation_id)}</td>
                  <td>
                    <span className={`licmgr-badge licmgr-tone-${b.tone}`}>{b.label}</span>
                    {m.pending_license && <span className="licmgr-badge licmgr-tone-neutral">⏳ pending</span>}
                  </td>
                  <td>{m.status?.tier || '—'}</td>
                  <td className="licmgr-mono">{m.status?.expires_at?.slice(0, 10) || '—'}</td>
                  <td>{formatDaysLeft(m.days_left)}</td>
                  <td className="licmgr-mono">{m.last_seen?.slice(0, 16).replace('T', ' ') || '—'}</td>
                  <td className="licmgr-actions">
                    <button className="op-btn op-btn-sm" onClick={() => onExportRequest(m)}>
                      Export request
                    </button>
                    <button
                      className="op-btn op-btn-sm op-btn-primary"
                      onClick={() => onPickUpload(m)}
                      disabled={busy}
                    >
                      Upload license
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
