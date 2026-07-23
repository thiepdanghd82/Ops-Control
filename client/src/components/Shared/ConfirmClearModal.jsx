/**
 * ConfirmClearModal — shared password step-up for any "Clear Data" bulk-wipe.
 *
 * Every Clear Data button opens THIS modal instead of wiping directly: it
 * shows the dataset + row count + an irreversible warning, requires the
 * operator's ACCOUNT PASSWORD, and only clears on success. The server enforces
 * the same password (defense-in-depth) and returns HTTP 200
 * { ok:false, code:'bad_password' } on a wrong password → shown inline here.
 *
 * Mirrors the Sprint S-2FA-RESET step-up flow. Uses the shared <Modal>
 * (draggable per Lesson 36; its onCloseRef autofocus keeps the password input
 * from losing focus on keystroke per Lesson 38). The input carries
 * data-modal-autofocus so focus lands on it (not the danger button) on open.
 */
import { useState, useEffect } from 'react';
import Modal from './Modal';
import { useI18n } from '../../utils/useI18n';
import { canSubmitClear, interpretClearResponse } from './ConfirmClearModal.helpers';
import './ConfirmClearModal.css';

/**
 * @param {object} p
 * @param {boolean} p.open
 * @param {() => void} p.onClose
 * @param {string} p.datasetLabel      human dataset name shown in the warning
 * @param {number} [p.rowCount]        current row count (shown if a number)
 * @param {(password:string)=>Promise<any>} p.clearApi  calls the dataset's clear endpoint
 * @param {() => void} [p.onCleared]   called after a successful wipe (reload here)
 */
export default function ConfirmClearModal({
  open,
  onClose,
  datasetLabel,
  rowCount,
  clearApi,
  onCleared,
}) {
  const { t } = useI18n();
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Fresh field + no stale error each time it (re)opens.
  useEffect(() => {
    if (open) {
      setPwd('');
      setErr('');
      setBusy(false);
    }
  }, [open]);

  const close = () => {
    if (!busy) onClose?.();
  };

  async function submit() {
    if (!canSubmitClear({ password: pwd, busy })) return;
    setBusy(true);
    setErr('');
    try {
      const r = await clearApi(pwd);
      if (interpretClearResponse(r) === 'bad_password') {
        setErr(t('clear_confirm.err_pwd'));
        return; // keep modal open
      }
      onCleared?.();
      onClose?.();
    } catch (e) {
      setErr(e?.message || t('clear_confirm.err_generic'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const hasCount = typeof rowCount === 'number';
  const body = hasCount
    ? t('clear_confirm.body')
        .replace('{dataset}', datasetLabel || '')
        .replace('{rows}', rowCount.toLocaleString())
    : t('clear_confirm.body_no_count').replace('{dataset}', datasetLabel || '');

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      severity="danger"
      draggable
      ariaLabelledBy="clearconf-title"
    >
      <Modal.Header id="clearconf-title" title={t('clear_confirm.title')} />
      <Modal.Body>
        <p className="ccm-body">{body}</p>
        <label className="ccm-label" htmlFor="ccm-pwd">
          {t('clear_confirm.pwd_label')}
        </label>
        <input
          id="ccm-pwd"
          type="password"
          className="ccm-input"
          data-modal-autofocus
          autoComplete="off"
          value={pwd}
          disabled={busy}
          onChange={(e) => {
            setPwd(e.target.value);
            if (err) setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {err && <div className="ccm-err">{err}</div>}
      </Modal.Body>
      <Modal.Footer>
        <button className="op-btn" onClick={close} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className="op-btn op-btn-danger" onClick={submit} disabled={busy || !pwd}>
          {busy ? t('common.saving') : t('clear_confirm.confirm_btn')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
