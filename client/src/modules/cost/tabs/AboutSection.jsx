/**
 * AboutSection — Settings → ℹ About + Diagnostics (v1.2 Sprint 1.4).
 *
 * Hiển thị thông tin runtime + diagnostics buttons cho IT troubleshooting:
 *
 *   Version & build:     Ops Control 1.2.0, build timestamp, Electron/Node/Chrome
 *   System:              Platform (macOS/Win/Linux), Mode hiện tại, embedded port
 *   License:             Customer, expires_at, installation_id (16 chars), features
 *   Live diagnostics:    4 test buttons (printer list, cache R/W, license check, HW fp)
 *   Copy report:         JSON snapshot for bug report submission
 *
 * Web mode: hide native-only sections, vẫn show app version + build.
 */

import React, { useEffect, useState } from 'react';
import desktop from '../../../services/desktopBridge';
import { api } from '../../../services/api';
import './AboutSection.css';

const APP_VERSION = __APP_VERSION__;
const BUILD_TIMESTAMP = '2026-04-27 13:15 GMT+7';

export default function AboutSection() {
  const [config, setConfig] = useState(null);
  const [license, setLicense] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [diagnostics, setDiagnostics] = useState({});

  useEffect(() => {
    if (!desktop.isAvailable) return;
    desktop.app.getConfig().then(setConfig).catch(() => {});
    setRuntime(typeof window !== 'undefined' && window.opsRuntime ? window.opsRuntime : null);
    // Best-effort fetch license info (only available in installed mode)
    if (window.ops?.license?.status) {
      window.ops.license.status().then(setLicense).catch(() => {});
    }
  }, []);

  // ─── Diagnostic test buttons ──────────────────────────────────
  const runDiag = async (key, t) => {
    // S-DIAG-FIX — platform-aware skip (gray pill, no IPC call). The
    // test config can declare `skip: () => string|false` to opt out
    // on platforms where the underlying API isn't supported.
    const skipReason = typeof t.skip === 'function' ? t.skip() : null;
    if (skipReason) {
      setDiagnostics((d) => ({ ...d, [key]: { skipped: true, reason: skipReason } }));
      return;
    }
    setDiagnostics((d) => ({ ...d, [key]: { running: true } }));
    try {
      const start = Date.now();
      const result = await t.run();
      setDiagnostics((d) => ({
        ...d,
        [key]: { ok: true, ms: Date.now() - start, result },
      }));
    } catch (err) {
      setDiagnostics((d) => ({
        ...d,
        [key]: { ok: false, error: err.message },
      }));
    }
  };

  const tests = [
    {
      key: 'printer',
      label: 'Liệt kê máy in',
      // S-DIAG-FIX (2026-05-05) — pdf-to-printer is Windows-only
      // (despite its self-description). Whitelist win32 so Linux is
      // also surfaced as "skipped" rather than crashing with "OS not
      // supported". Linux printer support tracked separately.
      skip: () => (desktop.platform !== 'win32') && 'Windows-only feature (pdf-to-printer)',
      run: () => desktop.printer.list(),
      summary: (r) => {
        const list = r.result;
        if (!Array.isArray(list)) return '?';
        if (list.length === 0) return 'no printers · check Windows print spooler';
        return `${list.length} máy in`;
      },
      // Empty list isn't a failure — it's a config warning.
      warnIf: (r) => Array.isArray(r.result) && r.result.length === 0,
    },
    {
      key: 'cache',
      label: 'Cache write/read',
      run: async () => {
        const k = `__diag_${Date.now()}`;
        await desktop.cache.set(k, { ts: Date.now() });
        const got = await desktop.cache.get(k);
        return got?.ts ? 'roundtrip OK' : 'roundtrip FAIL';
      },
      summary: (r) => r.result || '?',
    },
    {
      key: 'license',
      label: 'License status',
      run: () => window.ops.license.status(),
      summary: (r) => r.result?.valid ? `valid · ${r.result.customer}` : `invalid: ${r.result?.reason || '?'}`,
    },
    {
      key: 'hw',
      label: 'HW fingerprint',
      run: () => window.ops.license.fingerprint(),
      summary: (r) => r.result ? `${r.result.slice(0, 16)}…` : '?',
    },
    {
      key: 'health',
      label: 'Server /health',
      run: async () => {
        const r = await fetch('/health');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      },
      summary: (r) => r.result?.ok ? `OK · v${r.result.version}` : '?',
    },
    {
      key: 'backend',
      label: 'Quote backend',
      run: async () => {
        const r = await fetch('/api/shared/admin/quotes-backend');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      },
      summary: (r) => {
        const b = r.result;
        if (!b) return '?';
        const total = b.sqlite_count != null
          ? `sqlite=${b.sqlite_count}, file=${b.file_count}`
          : `file=${b.file_count ?? '?'}`;
        return `${b.backend || '?'} · ${total}`;
      },
    },
    {
      key: 'sse',
      label: 'SSE event stream',
      // S-DIAG-FIX (2026-05-05) — was bare fetch() that bypassed the
      // auth wrapper and got 401. Now uses api.get() which attaches
      // the Bearer token + cookies, matching how dataEventBus.js
      // (the production SSE consumer driving the "1 online" badge)
      // authenticates against /api/events/stream.
      run: () => api.get('/events/status'),
      summary: (r) => r.result?.ok ? `${r.result.subscribers ?? 0} subscriber(s)` : '?',
    },
    {
      key: 'users',
      label: 'Active users',
      run: async () => {
        const r = await fetch('/api/users/status');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      },
      summary: (r) => {
        const u = r.result?.users || [];
        const online = u.filter(x => x.online).length;
        return `${online} / ${u.length} online`;
      },
    },
  ];

  // ─── Snapshot report ───────────────────────────────────────────
  const snapshot = {
    app: {
      version: APP_VERSION,
      build: BUILD_TIMESTAMP,
      mode: config?.mode || 'web',
      remoteUrl: config?.remoteUrl || window.location?.origin,
      embeddedPort: config?.embeddedPort,
    },
    runtime: runtime || { isElectron: false, platform: 'web' },
    license: license ? {
      hasLicense: license.hasLicense,
      valid: license.valid,
      customer: license.customer,
      expires_at: license.expires_at,
      installation_id: license.installationId?.slice(0, 16) + '…',
    } : null,
    diagnostics,
    capturedAt: new Date().toISOString(),
  };

  const copyReport = () => {
    const text = JSON.stringify(snapshot, null, 2);
    navigator.clipboard?.writeText(text)
      .then(() => alert('Đã copy diagnostic report vào clipboard'))
      .catch(() => alert('Copy thất bại — copy thủ công từ console'));
    console.log('=== Ops Control diagnostic snapshot ===\n' + text);
  };

  return (
    <div className="about-section">
      <h2 className="about-title">ℹ About — Ops Control</h2>

      {/* ─── Version & Build ─── */}
      <div className="about-card">
        <h3 className="about-card-title">Version</h3>
        <div className="about-grid">
          <Row label="App version">{APP_VERSION}</Row>
          <Row label="Build">{BUILD_TIMESTAMP}</Row>
          <Row label="Mode">{config?.mode || (runtime?.isElectron ? 'loading…' : 'web')}</Row>
          <Row label="Server URL">
            <code>{config?.remoteUrl || window.location?.origin}</code>
          </Row>
          {config?.embeddedPort && <Row label="Embedded port">{config.embeddedPort}</Row>}
        </div>
      </div>

      {/* ─── Runtime (Electron only) ─── */}
      {runtime?.isElectron && (
        <div className="about-card">
          <h3 className="about-card-title">Runtime</h3>
          <div className="about-grid">
            <Row label="Platform">{runtime.platform}</Row>
            <Row label="Electron">{runtime.versions?.electron}</Row>
            <Row label="Node">{runtime.versions?.node}</Row>
            <Row label="Chrome">{runtime.versions?.chrome}</Row>
          </div>
        </div>
      )}

      {/* ─── License ─── */}
      {license && (
        <div className="about-card">
          <h3 className="about-card-title">License</h3>
          <div className="about-grid">
            <Row label="Status">
              {license.valid
                ? <span className="about-tag-ok">valid</span>
                : <span className="about-tag-err">{license.reason || 'invalid'}</span>}
            </Row>
            <Row label="Customer">{license.customer || '—'}</Row>
            <Row label="Expires">{license.expires_at ? new Date(license.expires_at).toLocaleDateString('vi-VN') : '—'}</Row>
            <Row label="Features">
              {(license.features || []).map((f) => (
                <span key={f} className="about-tag-feature">{f}</span>
              ))}
            </Row>
            <Row label="Installation ID">
              <code>{(license.installationId || '').slice(0, 24)}…</code>
            </Row>
          </div>
        </div>
      )}

      {/* ─── Diagnostics ─── */}
      {desktop.isAvailable && (
        <div className="about-card">
          <h3 className="about-card-title">Diagnostics</h3>
          <p className="about-card-desc">
            Run quick health checks. Useful when reporting bugs to vendor.
          </p>
          <div className="about-diag-grid">
            {tests.map((t) => {
              const r = diagnostics[t.key];
              return (
                <div key={t.key} className="about-diag-row">
                  <button
                    className="op-btn op-btn-ghost about-diag-btn"
                    onClick={() => runDiag(t.key, t)}
                    disabled={r?.running}
                  >
                    {r?.running ? '…' : '▶ Run'}
                  </button>
                  <div className="about-diag-label">{t.label}</div>
                  <div className="about-diag-result">
                    {!r ? <span className="about-diag-pending">— chưa chạy —</span>
                      : r.running ? 'running…'
                      : r.skipped ? <span className="about-diag-skip">⊘ Skipped · {r.reason}</span>
                      : r.ok && t.warnIf?.(r) ? <span className="about-diag-warn">⚠ {t.summary(r)} <small>({r.ms}ms)</small></span>
                      : r.ok ? <span className="about-diag-ok">✓ {t.summary(r)} <small>({r.ms}ms)</small></span>
                      : <span className="about-diag-err">✗ {r.error}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Report copy ─── */}
      <div className="about-card">
        <h3 className="about-card-title">Bug report</h3>
        <p className="about-card-desc">
          Copy diagnostic snapshot dạng JSON để gửi cho vendor khi báo lỗi.
          Sẽ chứa version, runtime, license info, và kết quả diagnostics đã chạy
          (KHÔNG chứa password / TOTP secret).
        </p>
        <button className="op-btn op-btn-primary" onClick={copyReport}>
          ⎘ Copy diagnostic report
        </button>
      </div>

      <div className="about-foot">
        © 2026 CCL Design Vietnam · Built by Henry Dang — NPI Manager · {BUILD_TIMESTAMP}
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="about-row">
      <div className="about-row-label">{label}</div>
      <div className="about-row-value">{children}</div>
    </div>
  );
}
