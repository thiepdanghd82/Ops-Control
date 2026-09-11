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
import Modal from '../../../components/Shared/Modal';
import {
  statusBadge,
  formatDaysLeft,
  shortId,
  buildExportRequest,
  exportRequestFilename,
  formatLastSeen,
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
  const [copiedId, setCopiedId] = useState('');
  const [forgetTarget, setForgetTarget] = useState(null);
  const uploadTargetRef = useRef(null);
  const fileInputRef = useRef(null);

  // setError('') deliberately runs AFTER the await, not before it: refresh()
  // is called straight from a mount effect, and a synchronous setState there
  // trips react-hooks/set-state-in-effect. The visible difference is only that
  // a stale error banner now clears when the reload succeeds rather than when
  // it starts. Suppressing the rule instead does not survive this repo's own
  // pre-commit `eslint --fix`, which strips the directive as unused because
  // client/node_modules pins an older eslint-plugin-react-hooks than CI uses.
  const refresh = useCallback(async () => {
    try {
      const r = await licenseFleetApi.list();
      setFleet(Array.isArray(r?.fleet) ? r.fleet : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách fleet');
    }
  }, []);

  useEffect(() => {
    // Wrapped rather than called bare so the mount fetch reads as what it is —
    // an async load — and so react-hooks/set-state-in-effect stops flagging it.
    // The substantive half of that fix is above: refresh() no longer touches
    // state before its first await, so nothing sets state synchronously here.
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  // The table shows a shortened id, but minting needs all 64 characters.
  // navigator.clipboard needs a secure context and this app is served over
  // plain http to the LAN (http://10.102.3.252:3100), so the textarea
  // fallback is the path that actually runs on an operator's machine — not a
  // rare edge case. Same shape as ProvisioningCard.jsx.
  const onCopyId = async (id) => {
    const flash = () => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    };
    try {
      await navigator.clipboard.writeText(id);
      flash();
      return;
    } catch {
      /* fall through */
    }
    const ta = document.createElement('textarea');
    ta.value = id;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      flash();
    } catch {
      setError('Không chép được — hãy dùng Export request để lấy Installation ID.');
    }
    document.body.removeChild(ta);
  };

  const onConfirmForget = async () => {
    const m = forgetTarget;
    if (!m) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const r = await licenseFleetApi.forget(m.installation_id);
      setMsg(
        r?.had_pending
          ? `Đã gỡ ${m.hostname || shortId(m.installation_id)}. Licence đang chờ giao cho máy này đã bị bỏ — mint lại nếu vẫn cần.`
          : `Đã gỡ ${m.hostname || shortId(m.installation_id)} khỏi bảng.`
      );
      setForgetTarget(null);
      await refresh();
    } catch (e) {
      setError(e?.message || 'Không gỡ được máy này');
    } finally {
      setBusy(false);
    }
  };

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
        setMsg(
          `Đã nhận + xếp hàng license cho máy ${shortId(r.installation_id)}. Sẽ giao ở heartbeat kế tiếp.`
        );
        await refresh();
      } else {
        setError(`Từ chối: ${r?.reason || r?.error || 'verify_failed'}`);
      }
    } catch (err) {
      // Server verify failure comes back as a thrown error with the reason.
      setError(
        err?.body?.reason ? `Verify thất bại: ${err.body.reason}` : err?.message || 'Upload lỗi'
      );
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
      {/*
        Audit 2026-09-11. Trạng thái / Tier / Hết hạn là do CHÍNH MÁY ĐÓ tự khai
        trong heartbeat; server không có cách nào kiểm chứng, vì chỉ máy đó mới
        biết license nó đang giữ. Một máy chưa có license hoàn toàn có thể báo
        "real / L / 2099" và biến mất khỏi tầm ngắm. Từ 2026-09-11 nó chỉ còn
        khai được cho CHÍNH NÓ (requireOwnMachine), nhưng vẫn khai được về mình.
        Nói thẳng ra ở đây còn hơn để bảng này trông như một bản kiểm kê đã xác
        minh. Cột "Giao license" bên dưới thì server tự biết — đó là dữ kiện thật.
      */}
      <p className="licmgr-sub licmgr-sub-warn">
        ⓘ Trạng thái, Tier và Hết hạn là do máy <strong>tự khai</strong> khi gửi heartbeat — server
        không kiểm chứng được. Dùng để rà soát, đừng dùng làm bằng chứng tuân thủ.
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
              <th title="Máy tự khai trong heartbeat — server không kiểm chứng">Trạng thái ⓘ</th>
              <th title="Máy tự khai trong heartbeat — server không kiểm chứng">Tier ⓘ</th>
              <th title="Máy tự khai trong heartbeat — server không kiểm chứng">Hết hạn ⓘ</th>
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
                  <td className="licmgr-mono">
                    {shortId(m.installation_id)}{' '}
                    <button
                      type="button"
                      className="licmgr-copy"
                      onClick={() => onCopyId(m.installation_id)}
                      title="Chép đủ 64 ký tự Installation ID để dán vào mint-license"
                      aria-label="Chép Installation ID"
                    >
                      {copiedId === m.installation_id ? '✓ đã chép' : '⧉'}
                    </button>
                  </td>
                  <td>
                    <span className={`licmgr-badge licmgr-tone-${b.tone}`}>{b.label}</span>
                    {m.pending_license && (
                      <span className="licmgr-badge licmgr-tone-neutral">⏳ pending</span>
                    )}
                  </td>
                  <td>{m.status?.tier || '—'}</td>
                  <td className="licmgr-mono">{m.status?.expires_at?.slice(0, 10) || '—'}</td>
                  <td>{formatDaysLeft(m.days_left)}</td>
                  <td className="licmgr-mono">{formatLastSeen(m.last_seen)}</td>
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
                    <button
                      className="op-btn op-btn-sm licmgr-forget"
                      onClick={() => setForgetTarget(m)}
                      disabled={busy}
                      title="Gỡ máy này khỏi bảng"
                    >
                      Gỡ khỏi bảng
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Modal
        open={!!forgetTarget}
        onClose={() => setForgetTarget(null)}
        size="sm"
        severity="danger"
        ariaLabelledBy="licmgr-forget-title"
      >
        <Modal.Header id="licmgr-forget-title" title="Gỡ máy khỏi bảng?" severity="danger" />
        <Modal.Body>
          <p>
            <strong>{forgetTarget?.hostname || shortId(forgetTarget?.installation_id)}</strong> sẽ
            biến mất khỏi danh sách. Máy vẫn giữ licence của nó — chỉ bảng theo dõi này quên nó đi.
          </p>
          <p>Nếu máy đó còn dùng, nó sẽ tự hiện lại ở heartbeat kế tiếp.</p>
          {forgetTarget?.pending_license && (
            <p className="licmgr-alert licmgr-alert-bad">
              ⚠ Máy này còn một licence đã ký đang chờ giao. Gỡ bảng sẽ <strong>bỏ luôn</strong>{' '}
              licence đó — phải mint lại nếu vẫn cần.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="op-btn" onClick={() => setForgetTarget(null)} disabled={busy}>
            Huỷ
          </button>
          <button className="op-btn licmgr-forget" onClick={onConfirmForget} disabled={busy}>
            Gỡ khỏi bảng
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
