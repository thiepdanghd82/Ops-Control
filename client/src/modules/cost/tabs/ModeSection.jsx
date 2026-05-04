/**
 * ModeSection — Settings → Connection Mode / Chế độ kết nối (v1.2 Sprint 1.3).
 *
 * Hiển thị + cho phép user đổi giữa 3 mode kết nối Tier 1 ↔ Tier 2:
 *
 *   embedded — Express server chạy in-process (single-user, offline OK)
 *   thin     — Gọi remote server 10.102.3.61:3000 (multi-user, mạng LAN)
 *   smart    — Hybrid: cache local + sync với remote (offline-capable, Sprint 3+)
 *
 * Sau khi đổi mode, app yêu cầu restart để apply (electron-store lưu
 * config; main.js đọc config khi khởi động).
 *
 * Web mode: hiện banner "không khả dụng".
 *
 * Strings live in client/src/i18n/strings.js under mode.* keys; the
 * inline LangFlagToggle in the header lets operators flip EN ↔ VN
 * without leaving the tab.
 */

import React, { useEffect, useState, useCallback } from 'react';
import desktop from '../../../services/desktopBridge';
import { parseOpsconn } from '../../../services/opsconnImport';
import { useI18n } from '../../../utils/useI18n';
import LangFlagToggle from '../../../components/Shared/LangFlagToggle';
import Modal from '../../../components/Shared/Modal';
import './ModeSection.css';

// MODES list is intentionally just IDs + presentation hints; all
// human-readable strings come from the i18n table so the cards
// re-render correctly when the user flips locales.
const MODES = [
  {
    id: 'embedded',
    icon: '💻',
    titleKey: 'mode.embedded.title',
    subKey: 'mode.embedded.subtitle',
    descKey: 'mode.embedded.desc',
    proKeys: ['mode.embedded.pro1', 'mode.embedded.pro2', 'mode.embedded.pro3'],
    conKeys: ['mode.embedded.con1', 'mode.embedded.con2'],
  },
  {
    id: 'thin',
    icon: '🌐',
    titleKey: 'mode.thin.title',
    subKey: 'mode.thin.subtitle',
    descKey: 'mode.thin.desc',
    proKeys: ['mode.thin.pro1', 'mode.thin.pro2', 'mode.thin.pro3'],
    conKeys: ['mode.thin.con1', 'mode.thin.con2'],
  },
  {
    id: 'smart',
    icon: '⚡',
    titleKey: 'mode.smart.title',
    subKey: 'mode.smart.subtitle',
    descKey: 'mode.smart.desc',
    proKeys: ['mode.smart.pro1', 'mode.smart.pro2', 'mode.smart.pro3'],
    conKeys: ['mode.smart.con1', 'mode.smart.con2'],
  },
];

export default function ModeSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [pendingUrl, setPendingUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  // Phase A.3a — Test Connection button. Shape: null | { status: 'pending' |
  // 'ok' | 'fail', message?: string }. Cleared on URL/mode change so a
  // stale "✓ Connected" doesn't linger after the operator types a new URL.
  const [testResult, setTestResult] = useState(null);
  // Phase A.3a — .opsconn import status strip, same shape as testResult.
  const [importResult, setImportResult] = useState(null);
  // Phase A.3a — when the operator imports a .opsconn while currentMode is
  // 'embedded' we hold the parsed profile here and open a confirmation
  // modal (D4 decision). null when the modal is closed.
  const [pendingImportProfile, setPendingImportProfile] = useState(null);

  const reload = useCallback(async () => {
    if (!desktop.isAvailable) return;
    const cfg = await desktop.app.getConfig();
    setConfig(cfg);
    setPendingMode(cfg.mode);
    setPendingUrl(cfg.remoteUrl || '');
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!desktop.isAvailable) {
    return (
      <div className="mode-section">
        <div className="mode-header">
          <h2 className="mode-title">{t('mode.title')}</h2>
          <LangFlagToggle />
        </div>
        <div className="mode-banner-info">
          <p dangerouslySetInnerHTML={{ __html: t('mode.banner.p1') }} />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="mode-section">
        <div className="mode-header">
          <h2 className="mode-title">{t('mode.title')}</h2>
          <LangFlagToggle />
        </div>
        <p>{t('mode.loading')}</p>
      </div>
    );
  }

  const apply = async () => {
    setLoading(true);
    try {
      const patch = { mode: pendingMode };
      if (pendingMode !== 'embedded') {
        patch.remoteUrl = pendingUrl;
      }
      const r = await desktop.app.setConfig(patch);
      if (r?.needsRestart) setNeedsRestart(true);
      else await reload();
    } catch (err) {
      alert(t('mode.err', { msg: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const restart = async () => {
    await desktop.app.relaunch();
  };

  // Phase A.3a — Test Connection. Probes pendingUrl / GET /health via
  // the desktop bridge (or fetch in web mode), surfaces version + RTT
  // on success or the error string on failure. Pure UX hint — does NOT
  // auto-apply the mode.
  const handleTestConnection = async () => {
    const url = (pendingUrl || '').trim();
    if (!url) return;
    setTestResult({ status: 'pending' });
    try {
      const r = await desktop.net.testServer(url);
      if (r?.ok) {
        setTestResult({
          status: 'ok',
          message: t('mode.test.success', { version: r.version || '?', ms: r.ms ?? 0 }),
        });
      } else {
        setTestResult({
          status: 'fail',
          message: t('mode.test.fail', { error: r?.error || 'unknown' }),
        });
      }
    } catch (e) {
      setTestResult({ status: 'fail', message: t('mode.test.fail', { error: e.message }) });
    }
  };

  // Phase A.3a — apply a parsed .opsconn profile. Splits out from the
  // import handler so the confirmation-modal Confirm button can call
  // it directly without re-parsing.
  const applyImportedProfile = (profile) => {
    setPendingMode('thin');
    setPendingUrl(profile.url);
    setTestResult(null);
    setImportResult({
      status: 'ok',
      message: t('mode.opsconn.imported', { name: profile.name }),
    });
  };

  // Phase A.3a — Import .opsconn profile. Reads through the existing
  // desktopBridge fs namespace (which returns a Uint8Array on both
  // desktop and web), decodes to text, validates via parseOpsconn,
  // and applies a remote profile by switching pendingMode='thin' +
  // pendingUrl=profile.url. The Apply button still owns the actual
  // commit so the operator can review before persisting.
  //
  // D4 decision: when the CURRENT (committed) mode is 'embedded' we
  // open a confirmation modal — the embedded operator has local data
  // they may not realise is about to stop syncing. For thin/smart
  // sources the switch is silent (already remote-aware).
  const handleImportOpsconn = async () => {
    setImportResult(null);
    try {
      const r = await desktop.fs.showOpenDialog({
        title: t('mode.opsconn.import_button'),
        filters: [{ name: 'Ops Connection Profile', extensions: ['opsconn'] }],
        properties: ['openFile'],
        accept: '.opsconn,application/json',
      });
      if (r?.canceled) return;

      // Desktop returns { filePaths: [path] }; web returns { files: [File] }.
      const fileRef = r?.filePaths?.[0] || r?.files?.[0];
      if (!fileRef) return;

      const raw = await desktop.fs.readFile(fileRef);
      const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8').decode(raw);

      const parsed = parseOpsconn(text);
      if (!parsed.ok) {
        setImportResult({ status: 'fail', message: parsed.error });
        return;
      }
      if (parsed.warnings?.length) {
        // Soft validations — surface in console for support; user-facing
        // strip stays focused on success/fail to avoid noise.
        console.warn('[opsconn] warnings:', parsed.warnings);
      }

      if (config?.mode === 'embedded') {
        setPendingImportProfile(parsed.profile);
        return;
      }
      applyImportedProfile(parsed.profile);
    } catch (e) {
      setImportResult({ status: 'fail', message: e.message });
    }
  };

  const confirmImport = () => {
    if (pendingImportProfile) applyImportedProfile(pendingImportProfile);
    setPendingImportProfile(null);
  };

  const cancelImport = () => {
    setPendingImportProfile(null);
    setImportResult({ status: 'info', message: t('mode.opsconn.cancelled') });
  };

  const dirty =
    pendingMode !== config.mode || (pendingMode !== 'embedded' && pendingUrl !== config.remoteUrl);

  // When this build is the SERVER role AND embedded mode is active, surface
  // the LAN URL(s) prominently — operators forget where to find the IP they
  // need to give to client machines, and the once-per-install first-run
  // dialog isn't always discoverable. Show it inline + a Copy button.
  const showServerUrls =
    config.mode === 'embedded' &&
    Array.isArray(config.lanAddresses) &&
    config.lanAddresses.length > 0 &&
    config.embeddedPort;
  const copyUrl = (url) => {
    try {
      navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked in some Electron contexts */
    }
  };

  return (
    <div className="mode-section">
      <div className="mode-header">
        <h2 className="mode-title">{t('mode.title')}</h2>
        <LangFlagToggle />
      </div>
      <p className="mode-subtitle">
        {t('mode.current')}
        <b>{config.mode}</b>
        {config.mode !== 'embedded' && (
          <>
            {' '}
            · <code>{config.remoteUrl}</code>
          </>
        )}
        {' · '}
        {t('mode.port')}
        <code>{config.embeddedPort || 'N/A'}</code>
        {config.buildRole && config.buildRole !== 'generic' && (
          <>
            {' '}
            · {t('mode.build')}
            <b>{config.buildRole.toUpperCase()}</b>
          </>
        )}
      </p>

      {showServerUrls && (
        <div className="mode-server-urls">
          <div className="mode-server-urls-title">
            {t('mode.urls.title')}
            <span className="mode-server-urls-hint">{t('mode.urls.hint')}</span>
            <button
              type="button"
              className="mode-server-urls-refresh"
              onClick={reload}
              title={t('mode.urls.refresh_tt')}
            >
              {t('mode.urls.refresh')}
            </button>
          </div>
          <ul>
            {config.lanAddresses.map(({ iface, address }) => {
              const url = `http://${address}:${config.embeddedPort}`;
              return (
                <li key={address}>
                  <code>{url}</code>
                  <span className="mode-server-urls-iface">({iface})</span>
                  <button
                    type="button"
                    className="mode-server-urls-copy"
                    onClick={() => copyUrl(url)}
                  >
                    {t('mode.urls.copy')}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mode-server-urls-warn">
            <span dangerouslySetInnerHTML={{ __html: t('mode.urls.warn_intro') }} />
            <ul>
              <li dangerouslySetInnerHTML={{ __html: t('mode.urls.warn_li1') }} />
              <li dangerouslySetInnerHTML={{ __html: t('mode.urls.warn_li2') }} />
              <li>{t('mode.urls.warn_li3')}</li>
            </ul>
          </div>
        </div>
      )}

      <div className="mode-grid">
        {MODES.map((m) => (
          <label
            key={m.id}
            className={`mode-card ${pendingMode === m.id ? 'mode-card-active' : ''}`}
          >
            <input
              type="radio"
              name="mode"
              value={m.id}
              checked={pendingMode === m.id}
              onChange={() => {
                setPendingMode(m.id);
                setTestResult(null);
                setImportResult(null);
              }}
              disabled={loading}
            />
            <div className="mode-card-head">
              <span className="mode-card-icon">{m.icon}</span>
              <div>
                <div className="mode-card-title">
                  {t(m.titleKey)}
                  {config.mode === m.id && (
                    <span className="mode-card-tag-active">{t('mode.active_tag')}</span>
                  )}
                </div>
                <div className="mode-card-sub">{t(m.subKey)}</div>
              </div>
            </div>
            <p className="mode-card-desc">{t(m.descKey)}</p>
            <div className="mode-card-pros-cons">
              <div>
                <div className="mode-card-pros-label">{t('mode.pros')}</div>
                <ul>
                  {m.proKeys.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mode-card-cons-label">{t('mode.cons')}</div>
                <ul>
                  {m.conKeys.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </label>
        ))}
      </div>

      <ModeLegend />

      {pendingMode !== 'embedded' && (
        <div className="mode-url-row">
          <label>
            <span>{t('mode.url_label')}</span>
            <div className="mode-url-input-row">
              <input
                type="text"
                value={pendingUrl}
                onChange={(e) => {
                  setPendingUrl(e.target.value);
                  setTestResult(null);
                  setImportResult(null);
                }}
                placeholder="http://10.102.3.61:3000"
                disabled={loading}
              />
              <button
                type="button"
                className="op-btn mode-test-btn"
                onClick={handleTestConnection}
                disabled={!pendingUrl?.trim() || loading || testResult?.status === 'pending'}
              >
                {testResult?.status === 'pending' ? t('mode.test.testing') : t('mode.test.button')}
              </button>
            </div>
          </label>
          {testResult && testResult.status !== 'pending' && (
            <div className={`mode-test-result mode-test-${testResult.status}`}>
              {testResult.message}
            </div>
          )}
        </div>
      )}

      <div className="mode-opsconn-row">
        <button
          type="button"
          className="op-btn mode-opsconn-btn"
          onClick={handleImportOpsconn}
          disabled={loading}
        >
          📂 {t('mode.opsconn.import_button')}
        </button>
        <small className="mode-opsconn-hint">{t('mode.opsconn.import_hint')}</small>
      </div>
      {importResult && (
        <div className={`mode-opsconn-result mode-opsconn-${importResult.status}`}>
          {importResult.status === 'ok' ? '✓ ' : '✗ '}
          {importResult.message}
        </div>
      )}

      {needsRestart ? (
        <div className="mode-restart-banner">
          <p>{t('mode.saved_restart')}</p>
          <button className="op-btn op-btn-primary" onClick={restart}>
            {t('mode.restart_now')}
          </button>
        </div>
      ) : (
        <div className="mode-actions">
          <button className="op-btn op-btn-primary" disabled={!dirty || loading} onClick={apply}>
            {loading ? t('mode.applying') : dirty ? t('mode.apply') : t('mode.applied')}
          </button>
          {dirty && (
            <button
              className="op-btn"
              disabled={loading}
              onClick={() => {
                setPendingMode(config.mode);
                setPendingUrl(config.remoteUrl || '');
                setTestResult(null);
                setImportResult(null);
              }}
            >
              {t('mode.cancel')}
            </button>
          )}
        </div>
      )}

      <div className="mode-note" dangerouslySetInnerHTML={{ __html: t('mode.note') }} />

      <SetupWizardRerun />

      <Modal
        open={!!pendingImportProfile}
        onClose={cancelImport}
        size="sm"
        severity="warning"
        ariaLabelledBy="mode-opsconn-confirm-title"
      >
        <Modal.Header
          id="mode-opsconn-confirm-title"
          title={t('mode.opsconn.switch_title')}
          severity="warning"
        />
        <Modal.Body>
          <p>
            {t('mode.opsconn.switch_message', {
              name: pendingImportProfile?.name || '',
              url: pendingImportProfile?.url || '',
            })}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="op-btn op-btn-ghost" onClick={cancelImport}>
            {t('mode.opsconn.switch_cancel')}
          </button>
          <button type="button" className="op-btn op-btn-primary" onClick={confirmImport}>
            {t('mode.opsconn.switch_confirm')}
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SetupWizardRerun — Sprint 1.5 SAP/IFS handover.
//
// The role-specific first-run wizard (showServerFirstRunDialog /
// showClientFirstRunDialog in desktop/main.js) only fires once per
// install — gated by `firstRunCompleted` in electron-store. Useful for
// an admin re-onboarding a workstation (machine reassigned, network
// changed, server moved) without a full reinstall. Clears the gate +
// mode + remoteUrl so the dialog re-fires fresh, then relaunches.
//
// Bilingual labels (EN over VN) since this is a handover-time action
// and the operator may not match the active locale.
// ═════════════════════════════════════════════════════════════
function SetupWizardRerun() {
  const [busy, setBusy] = React.useState(false);
  // Web build has nothing to "re-run" (the first-run dialog is desktop-
  // only). Hide the block entirely rather than show a disabled button
  // that does nothing — keeps the tab tidy.
  if (!desktop.isAvailable) return null;

  const handleRerun = async () => {
    if (
      !confirm(
        'Re-run the setup wizard?\n\n' +
          '• Connection mode + Remote URL will be cleared.\n' +
          '• The app will restart and re-show the first-run dialog.\n' +
          '• Your data, users, and quotes are NOT touched.\n\n' +
          'Chạy lại wizard cài đặt? Mode + URL sẽ bị xoá; dữ liệu giữ nguyên.'
      )
    )
      return;
    setBusy(true);
    try {
      await desktop.app.rerunFirstRun();
    } catch (err) {
      alert('Failed to relaunch: ' + err.message);
      setBusy(false);
    }
  };

  return (
    <div className="mode-rerun-wizard">
      <div className="mode-rerun-wizard-text">
        <div className="mode-rerun-wizard-en">Re-run the setup wizard</div>
        <div className="mode-rerun-wizard-vi">Chạy lại wizard cài đặt ban đầu</div>
        <div className="mode-rerun-wizard-hint">
          Useful when reassigning this machine to another user or moving the server. Connection
          settings will be wiped and the role-specific first-run dialog will fire on next launch.{' '}
          <i>User data is preserved.</i>
        </div>
      </div>
      <button type="button" className="op-btn" onClick={handleRerun} disabled={busy}>
        {busy ? '↻ Relaunching…' : '↻ Re-run wizard'}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ModeLegend — bilingual decision guide (EN over VN in each cell).
//
// Rendered always bilingual on purpose: a single operator typically
// covers a printer/factory floor where multiple shift-leads with
// different English levels share the same workstation. Showing both
// languages side-by-side avoids mis-selection when the active locale
// doesn't match the person sitting in front of the screen.
//
// The data is colocated in this component (not in strings.js) because
// each entry is intrinsically a {en, vi} pair — splitting them across
// two i18n keys per row would obscure the bilingual intent and make
// future row edits a 4-file change.
// ═════════════════════════════════════════════════════════════

const QUICK_REF = [
  {
    mode: 'Embedded',
    en: 'Local only — single user, no server',
    vi: 'Chỉ chạy cục bộ — một mình, không cần server',
  },
  {
    mode: 'Thin',
    en: 'Always online — multi-user, real-time',
    vi: 'Luôn cần online — nhiều người dùng, real-time',
  },
  {
    mode: 'Smart',
    en: 'Hybrid — works offline, auto-sync when online',
    vi: 'Hybrid — chạy được offline, tự sync khi có mạng',
  },
];

const SCENARIOS = [
  {
    en: 'Single user, no LAN, no shared server',
    vi: 'Một mình, không có mạng LAN, không có server chia sẻ',
    pick: 'Embedded',
  },
  {
    en: 'Multi-user team on stable office LAN, need real-time data sharing',
    vi: 'Nhiều người dùng trên LAN văn phòng ổn định, cần chia sẻ dữ liệu real-time',
    pick: 'Thin',
  },
  {
    en: 'Network drops sometimes (Wi-Fi office, factory floor with weak signal)',
    vi: 'Mạng hay rớt (Wi-Fi văn phòng, xưởng sản xuất sóng yếu)',
    pick: 'Smart',
    note: { en: 'when wiring is complete', vi: 'sau khi wire xong' },
  },
  {
    en: 'Working from home / mobile / on-site customer visit',
    vi: 'Làm việc tại nhà / di động / đi gặp khách hàng',
    pick: 'Smart',
    note: { en: 'when wiring is complete', vi: 'sau khi wire xong' },
  },
  {
    en: 'Demo, training, or onboarding (no shared data needed)',
    vi: 'Demo, đào tạo, hoặc onboarding (không cần chia sẻ dữ liệu)',
    pick: 'Embedded',
  },
  {
    en: 'YOUR machine is the server, others connect to your IP',
    vi: 'MÁY CỦA BẠN là server, người khác kết nối tới IP của bạn',
    pick: 'Embedded',
    note: { en: 'server build', vi: 'bản cài server' },
  },
  {
    en: 'Server crashes / restarts often → 50 client machines all stop',
    vi: 'Server hay crash / restart → 50 máy client đều dừng theo',
    pick: 'Smart',
    note: { en: 'reduces blast radius', vi: 'giảm phạm vi ảnh hưởng' },
  },
];

function ModeLegend() {
  return (
    <details className="mode-legend" open>
      <summary className="mode-legend-summary">
        <span className="mode-legend-icon" aria-hidden="true">
          📖
        </span>
        <span>
          <span className="mode-legend-en">Legend — How to choose a mode</span>
          <span className="mode-legend-vi">Hướng dẫn — Cách chọn chế độ</span>
        </span>
      </summary>

      <div className="mode-legend-body">
        {/* Quick reference: one-line summary per mode */}
        <div className="mode-legend-quickref">
          {QUICK_REF.map((q) => (
            <div key={q.mode} className="mode-legend-quickref-item">
              <span className={`mode-legend-pill mode-legend-pill-${q.mode.toLowerCase()}`}>
                {q.mode}
              </span>
              <div className="mode-legend-quickref-text">
                <div className="mode-legend-en">{q.en}</div>
                <div className="mode-legend-vi">{q.vi}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Decision matrix */}
        <table className="mode-legend-table">
          <thead>
            <tr>
              <th>
                <div className="mode-legend-en">Your situation</div>
                <div className="mode-legend-vi">Tình huống của bạn</div>
              </th>
              <th className="mode-legend-pick-col">
                <div className="mode-legend-en">Recommended</div>
                <div className="mode-legend-vi">Nên chọn</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {SCENARIOS.map((row, i) => (
              <tr key={i}>
                <td>
                  <div className="mode-legend-en">{row.en}</div>
                  <div className="mode-legend-vi">{row.vi}</div>
                </td>
                <td className="mode-legend-pick-col">
                  <span className={`mode-legend-pill mode-legend-pill-${row.pick.toLowerCase()}`}>
                    {row.pick}
                  </span>
                  {row.note && (
                    <div className="mode-legend-note">
                      <div className="mode-legend-en">({row.note.en})</div>
                      <div className="mode-legend-vi">({row.note.vi})</div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Smart-mode current readiness — important warning before user picks
            Smart and finds out half the app doesn't actually work offline.
            Update this block when the wiring audit improves. */}
        <div className="mode-legend-warn">
          <div className="mode-legend-warn-title">
            <div className="mode-legend-en">⚠ Smart mode current readiness</div>
            <div className="mode-legend-vi">⚠ Trạng thái Smart mode hiện tại</div>
          </div>
          <div className="mode-legend-warn-body">
            <div className="mode-legend-en">
              Smart-mode infrastructure is ready (cache + sync engine + write outbox), but
              <b> per-tab wiring is incremental</b>. Today, no operational tab uses the offline
              cache yet — choosing Smart will behave like Thin (network required) for Quote History,
              Calculators, Material Library, RFQ Tracker, Dashboard, etc. Only Hardware, Connection
              Mode, and About are usable offline because they don't make network calls.
            </div>
            <div className="mode-legend-vi">
              Hạ tầng Smart-mode đã sẵn sàng (cache + sync engine + write outbox), nhưng
              <b> wiring từng tab đang triển khai dần</b>. Hiện tại, chưa tab nghiệp vụ nào dùng
              cache offline — chọn Smart sẽ hành xử y hệt Thin (cần mạng) đối với Quote History,
              Calculator, Material Library, RFQ Tracker, Dashboard, v.v. Chỉ có Hardware, Connection
              Mode, About dùng được offline vì không gọi network.
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
