/**
 * HardwareSection — Settings → Hardware Devices / Thiết bị phần cứng (v1.1).
 *
 * Cho phép user/operator cấu hình kết nối tới các thiết bị đặc thù
 * ngành in mà desktop app hỗ trợ:
 *
 *   1. Máy in nhãn Zebra/TSC (TCP:9100 raw socket)
 *   2. Cân điện tử (RS232 / USB-Serial)
 *   3. Máy quét barcode (USB-HID)
 *   4. Máy in A4/A3 (OS print spooler)
 *
 * Tab này CHỈ hiển thị khi `desktop.isAvailable === true`. Trong web
 * mode (browser thường), hiện banner gợi ý cài bản desktop.
 *
 * Config persist qua `desktop.cache.set/get` (electron-store dưới mui)
 * để mỗi máy trạm có config riêng — không ép server backend.
 *
 * Strings live in client/src/i18n/strings.js under hw.* keys; the
 * inline LangFlagToggle in the header lets operators flip EN ↔ VN
 * without leaving the tab.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import desktop from '../../../services/desktopBridge';
import { useI18n } from '../../../utils/useI18n';
import LangFlagToggle from '../../../components/Shared/LangFlagToggle';
import './HardwareSection.css';

const CACHE_KEY = 'hardware-config';

const DEFAULT_CONFIG = {
  labelPrinter: { host: '', port: 9100 },
  scale:        { portPath: '', baudRate: 9600 },
  scanner:      { vendorId: 0, productId: 0, useKeyboardWedge: true },
  officePrinter:{ defaultName: '', defaultPaper: 'A4' },
};

export default function HardwareSection() {
  const { locale, t } = useI18n();
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [savedAt, setSavedAt] = useState(null);

  // Load saved config on mount
  useEffect(() => {
    if (!desktop.isAvailable) return;
    desktop.cache.get(CACHE_KEY).then((saved) => {
      if (saved) setCfg({ ...DEFAULT_CONFIG, ...saved });
    });
  }, []);

  const saveConfig = useCallback(async (next) => {
    setCfg(next);
    if (!desktop.isAvailable) return;
    await desktop.cache.set(CACHE_KEY, next);
    setSavedAt(new Date());
  }, []);

  // Web mode banner
  if (!desktop.isAvailable) {
    return (
      <div className="hw-section">
        <div className="hw-header">
          <h2 className="hw-title">{t('hw.title')}</h2>
          <LangFlagToggle />
        </div>
        <div className="hw-banner-info">
          <p dangerouslySetInnerHTML={{ __html: t('hw.banner.p1') }} />
          <p>{t('hw.banner.p2')}</p>
        </div>
      </div>
    );
  }

  const timeLocale = locale === 'vi' ? 'vi-VN' : 'en-GB';

  return (
    <div className="hw-section">
      <div className="hw-header">
        <h2 className="hw-title">{t('hw.title')}</h2>
        <LangFlagToggle />
      </div>
      <p className="hw-subtitle">
        {t('hw.subtitle')}
        {savedAt && (
          <span className="hw-saved">
            {t('hw.saved_at', { time: savedAt.toLocaleTimeString(timeLocale) })}
          </span>
        )}
      </p>

      <LabelPrinterCard
        config={cfg.labelPrinter}
        onChange={(next) => saveConfig({ ...cfg, labelPrinter: next })}
      />

      <ScaleCard
        config={cfg.scale}
        onChange={(next) => saveConfig({ ...cfg, scale: next })}
      />

      <ScannerCard
        config={cfg.scanner}
        onChange={(next) => saveConfig({ ...cfg, scanner: next })}
      />

      <OfficePrinterCard
        config={cfg.officePrinter}
        onChange={(next) => saveConfig({ ...cfg, officePrinter: next })}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Sub-cards (mỗi loại thiết bị 1 card riêng)
// ═════════════════════════════════════════════════════════════

function LabelPrinterCard({ config, onChange }) {
  const { t } = useI18n();
  const [host, setHost] = useState(config.host || '');
  const [port, setPort] = useState(config.port || 9100);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  const ping = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const r = await desktop.labelPrinter.ping(host, port);
      setPingResult(r);
    } catch (err) {
      setPingResult({ ok: false, error: err.message });
    } finally {
      setPinging(false);
    }
  };

  const sendTest = async () => {
    // ZPL minimal: print 1 small label "TEST" — most Zebra ZD/ZT support
    const zpl = `^XA^FO50,50^A0N,40,40^FDOps Control TEST^FS^XZ`;
    try {
      await desktop.labelPrinter.sendZpl(host, port, zpl);
      alert(t('hw.lp.test_sent'));
    } catch (err) {
      alert(t('hw.lp.test_err', { msg: err.message }));
    }
  };

  return (
    <div className="hw-card">
      <h3 className="hw-card-title">{t('hw.lp.title')}</h3>
      <div className="hw-row">
        <label className="hw-field">
          <span>{t('hw.lp.host')}</span>
          <input
            type="text"
            placeholder="192.168.1.50"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onBlur={() => onChange({ host, port })}
          />
        </label>
        <label className="hw-field hw-field-narrow">
          <span>{t('hw.lp.port')}</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value, 10) || 9100)}
            onBlur={() => onChange({ host, port })}
          />
        </label>
      </div>
      <div className="hw-actions">
        <button className="op-btn" disabled={!host || pinging} onClick={ping}>
          {pinging ? t('hw.lp.pinging') : t('hw.lp.ping')}
        </button>
        <button className="op-btn op-btn-primary" disabled={!host} onClick={sendTest}>
          {t('hw.lp.send_test')}
        </button>
      </div>
      {pingResult && (
        <div className={`hw-result ${pingResult.ok ? 'ok' : 'err'}`}>
          {pingResult.ok
            ? t('hw.lp.ok_latency', { ms: pingResult.latencyMs })
            : t('hw.lp.err', { err: pingResult.error || 'unknown' })}
        </div>
      )}
    </div>
  );
}

function ScaleCard({ config, onChange }) {
  const { t } = useI18n();
  const [ports, setPorts] = useState([]);
  const [portPath, setPortPath] = useState(config.portPath || '');
  const [baudRate, setBaudRate] = useState(config.baudRate || 9600);
  const [weight, setWeight] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const unsubRef = useRef(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await desktop.scale.listPorts();
      setPorts(list);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const open = async () => {
    try {
      await desktop.scale.open(portPath, baudRate);
      // Subscribe to live weight stream
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = desktop.scale.onWeight((w) => setWeight(w));
      onChange({ portPath, baudRate });
    } catch (err) {
      alert(t('hw.sc.open_err', { msg: err.message }));
    }
  };

  const close = async () => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = null;
    setWeight(null);
    await desktop.scale.close();
  };

  // Cleanup on unmount
  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  return (
    <div className="hw-card">
      <h3 className="hw-card-title">{t('hw.sc.title')}</h3>
      <div className="hw-row">
        <label className="hw-field">
          <span>{t('hw.sc.com_port')}</span>
          <select value={portPath} onChange={(e) => setPortPath(e.target.value)}>
            <option value="">{t('hw.sc.choose_port')}</option>
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="hw-field hw-field-narrow">
          <span>{t('hw.sc.baud')}</span>
          <select value={baudRate} onChange={(e) => setBaudRate(parseInt(e.target.value, 10))}>
            <option value="4800">4800</option>
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
          </select>
        </label>
        <button className="op-btn op-btn-ghost" onClick={refresh} disabled={refreshing}>
          {refreshing ? '…' : t('hw.sc.scan_ports')}
        </button>
      </div>
      <div className="hw-actions">
        <button className="op-btn op-btn-primary" disabled={!portPath} onClick={open}>
          {t('hw.sc.connect')}
        </button>
        <button className="op-btn" onClick={close} disabled={!unsubRef.current}>
          {t('hw.sc.disconnect')}
        </button>
      </div>
      {weight && (
        <div className="hw-result ok">
          {t('hw.sc.weight')}<b>{weight.value} {weight.unit}</b> &nbsp; <small>(raw: {weight.raw})</small>
        </div>
      )}
    </div>
  );
}

function ScannerCard({ config, onChange }) {
  const { t } = useI18n();
  const [devices, setDevices] = useState([]);
  const [vendorId, setVendorId] = useState(config.vendorId || 0);
  const [productId, setProductId] = useState(config.productId || 0);
  const [useWedge, setUseWedge] = useState(config.useKeyboardWedge !== false);
  const [lastScan, setLastScan] = useState(null);
  const unsubRef = useRef(null);
  const wedgeUnsubRef = useRef(null);

  const refresh = async () => {
    const list = await desktop.scanner.listDevices();
    setDevices(list);
  };

  useEffect(() => { refresh(); }, []);

  const startListen = async () => {
    if (unsubRef.current) unsubRef.current();
    if (wedgeUnsubRef.current) wedgeUnsubRef.current();

    if (useWedge) {
      // Keyboard wedge mode — không cần open device
      wedgeUnsubRef.current = desktop.scanner.listenKeyboardWedge((e) => setLastScan(e));
    } else {
      // HID raw mode — open device
      const dev = devices.find((d) => d.vendorId === vendorId && d.productId === productId);
      if (!dev) {
        alert(t('hw.sn.no_hid'));
        return;
      }
      try {
        await desktop.scanner.open(vendorId, productId);
        unsubRef.current = desktop.scanner.onScan((e) => setLastScan(e));
      } catch (err) {
        alert(t('hw.sn.open_err', { msg: err.message }));
        return;
      }
    }
    onChange({ vendorId, productId, useKeyboardWedge: useWedge });
  };

  const stopListen = async () => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (wedgeUnsubRef.current) { wedgeUnsubRef.current(); wedgeUnsubRef.current = null; }
    await desktop.scanner.close();
    setLastScan(null);
  };

  useEffect(() => () => {
    if (unsubRef.current) unsubRef.current();
    if (wedgeUnsubRef.current) wedgeUnsubRef.current();
  }, []);

  return (
    <div className="hw-card">
      <h3 className="hw-card-title">{t('hw.sn.title')}</h3>
      <div className="hw-row">
        <label className="hw-checkbox">
          <input type="checkbox" checked={useWedge} onChange={(e) => setUseWedge(e.target.checked)} />
          <span dangerouslySetInnerHTML={{ __html: t('hw.sn.wedge_label') }} />
        </label>
      </div>
      {!useWedge && (
        <div className="hw-row">
          <label className="hw-field">
            <span>{t('hw.sn.hid_device')}</span>
            <select
              value={`${vendorId}:${productId}`}
              onChange={(e) => {
                const [v, p] = e.target.value.split(':').map(Number);
                setVendorId(v); setProductId(p);
              }}
            >
              <option value="0:0">{t('hw.sn.choose')}</option>
              {devices.map((d) => (
                <option key={`${d.vendorId}:${d.productId}`} value={`${d.vendorId}:${d.productId}`}>
                  {d.product || d.manufacturer || `VID:${d.vendorId.toString(16)} PID:${d.productId.toString(16)}`}
                </option>
              ))}
            </select>
          </label>
          <button className="op-btn op-btn-ghost" onClick={refresh}>{t('hw.sn.scan')}</button>
        </div>
      )}
      <div className="hw-actions">
        <button className="op-btn op-btn-primary" onClick={startListen}>{t('hw.sn.start_listen')}</button>
        <button className="op-btn" onClick={stopListen}>{t('hw.sn.stop')}</button>
      </div>
      {lastScan && (
        <div className="hw-result ok">
          {t('hw.sn.scanned')}<b>{lastScan.code}</b> &nbsp;
          <small>({lastScan.source || 'hid'} — {new Date(lastScan.timestamp).toLocaleTimeString()})</small>
        </div>
      )}
    </div>
  );
}

function OfficePrinterCard({ config, onChange }) {
  const { t } = useI18n();
  const [printers, setPrinters] = useState([]);
  const [defaultName, setDefaultName] = useState(config.defaultName || '');
  const [defaultPaper, setDefaultPaper] = useState(config.defaultPaper || 'A4');

  useEffect(() => {
    desktop.printer.list().then(setPrinters).catch((err) => {
      console.warn('Cannot list printers:', err.message);
    });
  }, []);

  return (
    <div className="hw-card">
      <h3 className="hw-card-title">{t('hw.op.title')}</h3>
      <div className="hw-row">
        <label className="hw-field">
          <span>{t('hw.op.default')}</span>
          <select
            value={defaultName}
            onChange={(e) => setDefaultName(e.target.value)}
            onBlur={() => onChange({ defaultName, defaultPaper })}
          >
            <option value="">{t('hw.op.system')}</option>
            {printers.map((p) => (
              <option key={p.name || p.deviceId} value={p.name}>
                {p.name} {p.isDefault ? '(default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="hw-field hw-field-narrow">
          <span>{t('hw.op.paper')}</span>
          <select
            value={defaultPaper}
            onChange={(e) => setDefaultPaper(e.target.value)}
            onBlur={() => onChange({ defaultName, defaultPaper })}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="Letter">Letter</option>
          </select>
        </label>
      </div>
      <p className="hw-hint">{t('hw.op.hint')}</p>
    </div>
  );
}
