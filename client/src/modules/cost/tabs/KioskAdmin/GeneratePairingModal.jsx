// Sprint MES-2.7 — pairing-card modal. Mirrors Sprint 1.5's provisioning
// card (machine_code dropdown, server-issued URL, A6 print stylesheet).
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../../../../components/Shared/Modal.jsx';
import { sharedApi } from '../../../../services/api.js';
import { useI18n } from '../../../../utils/useI18n.js';
import * as kioskApi from './api.js';

export default function GeneratePairingModal({ open, onClose, onIssued }) {
  const { t } = useI18n();
  const [machines, setMachines] = useState([]);
  const [machineCode, setMachineCode] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const printRef = useRef(null);

  // Load machine_code list from existing MachineProfiles library endpoint.
  useEffect(() => {
    if (!open) return;
    sharedApi
      .getMachineProfiles()
      .then((r) => setMachines(Array.isArray(r?.profiles) ? r.profiles : Array.isArray(r) ? r : []))
      .catch(() => setMachines([]));
  }, [open]);

  // Render QR when issued URL becomes available.
  useEffect(() => {
    if (!issued?.pairing_url) {
      setQrDataUrl(null);
      return;
    }
    const fullUrl = window.location.origin + issued.pairing_url;
    QRCode.toDataURL(fullUrl, { width: 256, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch((e) => console.warn('[kiosk] QR generation failed', e));
  }, [issued]);

  const fullUrl = useMemo(
    () => (issued?.pairing_url ? window.location.origin + issued.pairing_url : ''),
    [issued]
  );

  const handleIssue = async () => {
    if (!machineCode || issuing) return;
    setIssuing(true);
    setError(null);
    try {
      const r = await kioskApi.issuePairing(machineCode);
      setIssued(r);
      onIssued?.(r);
    } catch (e) {
      setError(e?.body?.detail || e?.body?.type || e?.message || 'Failed to issue pairing');
    } finally {
      setIssuing(false);
    }
  };

  const reset = () => {
    setIssued(null);
    setMachineCode('');
    setError(null);
    setQrDataUrl(null);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="md"
    >
      <Modal.Header title={t('planning.kiosk_admin.modal_title')} />
      <Modal.Body>
        {!issued ? (
          <>
            <label htmlFor="kiosk-machine" className="op-label">
              {t('planning.kiosk_admin.col_machine')}
            </label>
            <select
              id="kiosk-machine"
              className="op-input"
              value={machineCode}
              onChange={(e) => setMachineCode(e.target.value)}
              disabled={issuing}
            >
              <option value="">—</option>
              {machines.map((m) => (
                <option key={m.id || m.code} value={m.id || m.code}>
                  {m.id || m.code} {m.name ? `· ${m.name}` : ''}
                </option>
              ))}
            </select>
            {error && <p className="op-form-error">{error}</p>}
          </>
        ) : (
          <div className="kiosk-pair-result" ref={printRef}>
            <div className="pairing-print-card">
              <h3>{issued.machine_code || machineCode}</h3>
              {qrDataUrl && <img src={qrDataUrl} alt="Pairing QR" className="pairing-qr" />}
              <div className="pairing-url">
                <code>{fullUrl}</code>
              </div>
              <div className="pairing-meta">
                {t('planning.kiosk_admin.expires')}:{' '}
                <strong>{new Date(issued.expires_at).toLocaleString()}</strong>
              </div>
              <p className="pairing-footer">Scan to pair this device. Single-use, expires above.</p>
            </div>
            <div className="kiosk-pair-actions">
              <button type="button" className="op-btn op-btn-ghost" onClick={copyUrl}>
                Copy URL
              </button>
              <button
                type="button"
                className="op-btn op-btn-secondary"
                onClick={() => window.print()}
              >
                {t('planning.kiosk_admin.print_cta')}
              </button>
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="op-btn op-btn-ghost"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          {issued ? 'Close' : 'Cancel'}
        </button>
        {!issued && (
          <button
            type="button"
            className="op-btn op-btn-primary"
            disabled={!machineCode || issuing}
            onClick={handleIssue}
          >
            {issuing ? '…' : t('planning.kiosk_admin.generate_cta')}
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
