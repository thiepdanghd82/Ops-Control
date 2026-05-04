/**
 * ConnectionInfoSection — Phase A.2 admin dashboard.
 *
 * Server admin's view of the connection info to hand off to client
 * machines. Mirrors PermissionGroupsSection.jsx in placement and
 * lifecycle (loaded from Settings.jsx > Account Control sub-tab).
 *
 * Data source: GET /api/server-info (admin-only, rate-limited, audit-
 * logged). Renders server identity from Phase A.1 wizard + auto-
 * detected LAN URL + QR code + .opsconn profile export.
 *
 * Multi-NIC enhancement: when the server has multiple non-internal
 * IPv4 interfaces (e.g. en0 + bridge100), a dropdown lets the operator
 * pick which IP the client should use. The first entry is annotated
 * with "(auto)" — auto-pick = ethernet > wifi > virtual heuristic from
 * server/utils/networkInfo.js prefRank().
 */
import { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { costApi } from '../../../services/api';
import { useI18n } from '../../../utils/useI18n';
import './ConnectionInfoSection.css';

export default function ConnectionInfoSection() {
  const t = useI18n();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [selectedIface, setSelectedIface] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyToast, setCopyToast] = useState('');

  useEffect(() => {
    costApi
      .getServerInfo()
      .then((r) => {
        if (r && r.ok !== false) setInfo(r);
        else setError(r?.error || 'Server info unavailable');
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  // Effective URL = operator's selected IP override OR auto-picked primary.
  const effectiveUrl = useMemo(() => {
    if (!info) return '';
    if (selectedIface && Array.isArray(info.candidates)) {
      const c = info.candidates.find((x) => x.iface === selectedIface);
      if (c) return `http://${c.address}:${info.port}`;
    }
    return info.primaryUrl || '';
  }, [info, selectedIface]);

  // Regenerate QR every time the effective URL changes. Wrapped in an
  // async IIFE with cancellation guard so the setState is never
  // synchronous-within-effect (cascading-render rule) and a fast URL
  // change doesn't race a slow QRCode.toDataURL() promise into the
  // wrong final state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!effectiveUrl) {
        if (!cancelled) setQrDataUrl('');
        return;
      }
      try {
        const url = await QRCode.toDataURL(effectiveUrl, { width: 200, margin: 1 });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUrl]);

  function copy(value) {
    if (!value) return;
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopyToast(t('conn_info.copied'));
        setTimeout(() => setCopyToast(''), 1500);
      })
      .catch(() => {
        /* clipboard denied — ignore silently */
      });
  }

  async function exportOpsconn() {
    if (!info) return;
    const profile = {
      schemaVersion: 1,
      kind: 'ops-connection-profile',
      exportedAt: new Date().toISOString(),
      // Phase A.2 enhancement 2: audit trail if file leaks. Server returns
      // requesterUsername for admin who triggered the GET; we copy it into
      // the exported profile so a recovered .opsconn can be traced back.
      exportedBy: info.requesterUsername || '-',
      server: {
        name: info.serverName,
        id: info.serverId,
        url: effectiveUrl,
        language: info.language,
        timezone: info.timezone,
      },
    };
    const json = JSON.stringify(profile, null, 2);
    const safeName = (info.serverName || 'server').replace(/[^A-Za-z0-9_-]+/g, '_');
    const filename = `${safeName}.opsconn`;

    // Desktop path: native save dialog via Electron preload bridge
    if (window.opsRuntime?.fs?.showSaveDialog) {
      try {
        const r = await window.opsRuntime.fs.showSaveDialog({
          defaultPath: filename,
          filters: [{ name: 'Ops Connection Profile', extensions: ['opsconn'] }],
        });
        if (!r?.canceled && r?.filePath) {
          await window.opsRuntime.fs.writeFile(r.filePath, json);
        }
        return;
      } catch {
        // Fall through to web download
      }
    }
    // Web fallback: trigger browser download
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (error) {
    return <div className="conn-info-error">Error: {error}</div>;
  }
  if (!info) {
    return <div className="conn-info-loading">{t('conn_info.loading')}</div>;
  }

  const showMultiNicPicker = Array.isArray(info.candidates) && info.candidates.length > 1;
  const autoIface = info.candidates?.[0]?.iface;

  return (
    <section className="conn-info-section">
      <h2 className="conn-info-h2">{t('conn_info.title')}</h2>
      <p className="conn-info-sub">{t('conn_info.subtitle')}</p>

      <div className="conn-info-grid">
        <div className="conn-info-fields">
          <label className="conn-info-label">{t('conn_info.server_name')}</label>
          <div className="conn-info-row">
            <code className="conn-info-value">{info.serverName}</code>
            <button type="button" className="conn-info-copy" onClick={() => copy(info.serverName)}>
              {t('conn_info.copy')}
            </button>
          </div>

          <label className="conn-info-label">{t('conn_info.server_id')}</label>
          <div className="conn-info-row">
            <code className="conn-info-value conn-info-id">{info.serverId || '—'}</code>
            {info.serverId && (
              <button type="button" className="conn-info-copy" onClick={() => copy(info.serverId)}>
                {t('conn_info.copy')}
              </button>
            )}
          </div>

          <label className="conn-info-label">{t('conn_info.server_url')}</label>
          <div className="conn-info-row">
            <code className="conn-info-value">{effectiveUrl}</code>
            <button type="button" className="conn-info-copy" onClick={() => copy(effectiveUrl)}>
              {t('conn_info.copy')}
            </button>
          </div>

          {showMultiNicPicker && (
            <>
              <label className="conn-info-label">{t('conn_info.multi_nic_hint')}</label>
              <select
                className="conn-info-select"
                value={selectedIface || autoIface || ''}
                onChange={(e) => setSelectedIface(e.target.value)}
              >
                {info.candidates.map((c) => (
                  <option key={c.iface} value={c.iface}>
                    {c.iface} — {c.address}
                    {c.iface === autoIface ? ' (auto)' : ''}
                  </option>
                ))}
              </select>
            </>
          )}

          {copyToast && <div className="conn-info-toast">{copyToast}</div>}

          <div className="conn-info-actions">
            <button
              type="button"
              className="conn-info-export op-btn op-btn-primary"
              onClick={exportOpsconn}
            >
              {t('conn_info.export_opsconn')}
            </button>
          </div>
        </div>

        <div className="conn-info-qr">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR for server URL" className="conn-info-qr-img" />
          ) : (
            <div className="conn-info-qr-placeholder">QR…</div>
          )}
          <p className="conn-info-qr-caption">{t('conn_info.qr_caption')}</p>
        </div>
      </div>
    </section>
  );
}
