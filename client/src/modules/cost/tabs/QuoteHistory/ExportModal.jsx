/**
 * ExportModal — operator-facing dialog for triggering xlsx export of a
 * Quote History row. Wraps the MVP-1/1.5/2 server pipeline at
 * POST /api/quotes/:id/export.
 *
 * UX:
 *   - Variant radio: customer copy vs internal copy (column visibility
 *     differs on Materials/Inks/Processes; customer also gets the
 *     watermark per MVP-2 Item E).
 *   - Language radio: en / vi / EN+VI bilingual (default).
 *   - Tier picker: hidden for single-tier quotes; multi-tier shows
 *     "All tiers" + individual checkboxes. All-tiers produces a single
 *     zip bundling one xlsx per tier (server-side).
 *
 * The success path triggers a browser download via a temp <a download>
 * element. Multi-tier exports come back as a .zip with the same
 * mechanism — the server sets the right Content-Type + X-Ops-Export-Format
 * header which the api wrapper consumes.
 *
 * Cancellation: an AbortController is shared between the in-flight
 * fetch + the modal close handler. Closing mid-fetch aborts the request
 * and surfaces nothing to the user (ABORT errors are silent by design).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../../../components/Shared/Modal';
import { useI18n } from '../../../../utils/useI18n';
import { exportQuote, QuoteExportError } from '../../../../services/quoteExportApi';
import {
  buildTierList,
  canSubmit,
  errorCodeToI18nKey,
  isSingleTier,
  resolveSelectedTiers,
} from './exportModalLogic';
import './ExportModal.css';

const DEFAULT_VARIANT = 'internal';
const DEFAULT_LANG = 'bilingual';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.quote   Quote History row; null when modal closed
 * @param {() => void} props.onClose
 * @param {(filename: string) => void} [props.onSuccess]   optional toast callback
 */
export default function ExportModal({ open, quote, onClose, onSuccess }) {
  const { t } = useI18n();
  const tiers = useMemo(() => buildTierList(quote), [quote]);
  const single = isSingleTier(tiers);

  // Selection state. Reset every time the modal re-opens for a new quote
  // so a previous selection from another row doesn't leak across.
  const [variant, setVariant] = useState(DEFAULT_VARIANT);
  const [lang, setLang] = useState(DEFAULT_LANG);
  const [allTiers, setAllTiers] = useState(true);
  const [selected, setSelected] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const abortRef = useRef(null);

  // Re-initialise selection state whenever the modal opens on a fresh
  // quote. Closing the modal also resets so re-opens look identical.
  useEffect(() => {
    if (open) {
      setVariant(DEFAULT_VARIANT);
      setLang(DEFAULT_LANG);
      setAllTiers(true);
      setSelected({});
      setSubmitting(false);
      setErrMsg('');
    }
  }, [open, quote?.id]);

  // Abort any in-flight fetch when the modal closes or unmounts. The
  // wrapper translates AbortError → QuoteExportError(code='ABORT') which
  // is filtered below — no toast for a user-initiated close.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    return () => abortRef.current?.abort();
  }, [open]);

  const submitDisabled = !canSubmit({ allTiers, selected }, tiers) || submitting;

  function handleClose() {
    if (submitting) {
      // Closing mid-fetch — abort first, THEN dismiss. The abort prevents
      // a stale onSuccess from firing after the modal is gone.
      abortRef.current?.abort();
    }
    onClose?.();
  }

  async function handleExport() {
    if (!quote || submitDisabled) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSubmitting(true);
    setErrMsg('');
    try {
      const out = await exportQuote({
        quoteId: quote.id,
        variant,
        lang,
        tiers: resolveSelectedTiers({ allTiers, selected }, tiers),
        signal: ctrl.signal,
      });
      onSuccess?.(out.filename);
      onClose?.();
    } catch (err) {
      if (err instanceof QuoteExportError) {
        if (err.code === 'ABORT') {
          // User-initiated cancel — modal already closing; suppress.
          return;
        }
        const key = errorCodeToI18nKey(err.code);
        const msg = t(key, { detail: err.detail || err.message || err.code });
        setErrMsg(msg);
      } else {
        setErrMsg(t('qexp.error.generic', { detail: err?.message || 'unknown error' }));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      severity="info"
      dismissable={!submitting}
      ariaLabelledBy="qe-export-title"
    >
      <Modal.Header
        id="qe-export-title"
        title={t('qexp.modal.title')}
        subtitle={buildSubtitle(quote)}
        severity="info"
      />
      <Modal.Body>
        <fieldset className="qe-fieldset" disabled={submitting}>
          <legend className="qe-legend">{t('qexp.field.variant.label')}</legend>
          <div className="qe-radio-row">
            <label className="qe-radio">
              <input
                type="radio"
                name="qe-variant"
                value="customer"
                checked={variant === 'customer'}
                onChange={() => setVariant('customer')}
              />
              <span>{t('qexp.field.variant.customer')}</span>
            </label>
            <label className="qe-radio">
              <input
                type="radio"
                name="qe-variant"
                value="internal"
                checked={variant === 'internal'}
                onChange={() => setVariant('internal')}
              />
              <span>{t('qexp.field.variant.internal')}</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="qe-fieldset" disabled={submitting}>
          <legend className="qe-legend">{t('qexp.field.lang.label')}</legend>
          <div className="qe-radio-row">
            <label className="qe-radio">
              <input
                type="radio"
                name="qe-lang"
                value="en"
                checked={lang === 'en'}
                onChange={() => setLang('en')}
              />
              <span>{t('qexp.field.lang.en')}</span>
            </label>
            <label className="qe-radio">
              <input
                type="radio"
                name="qe-lang"
                value="vi"
                checked={lang === 'vi'}
                onChange={() => setLang('vi')}
              />
              <span>{t('qexp.field.lang.vi')}</span>
            </label>
            <label className="qe-radio">
              <input
                type="radio"
                name="qe-lang"
                value="bilingual"
                checked={lang === 'bilingual'}
                onChange={() => setLang('bilingual')}
              />
              <span>{t('qexp.field.lang.bilingual')}</span>
            </label>
          </div>
        </fieldset>

        {single ? (
          <div className="qe-single-tier">
            {t('qexp.field.tiers.single', {
              n: tiers[0]?.moq ?? '?',
              eau: tiers[0]?.eau ?? '?',
            })}
          </div>
        ) : (
          <fieldset className="qe-fieldset" disabled={submitting}>
            <legend className="qe-legend">{t('qexp.field.tiers.label')}</legend>
            <label className="qe-check qe-check-all">
              <input
                type="checkbox"
                checked={allTiers}
                onChange={(e) => setAllTiers(e.target.checked)}
              />
              <span>{t('qexp.field.tiers.all', { n: tiers.length })}</span>
            </label>
            <div className="qe-tier-list">
              {tiers.map((tier) => (
                <label key={tier.idx} className={`qe-check ${allTiers ? 'qe-check-disabled' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={allTiers}
                    checked={!!selected[tier.idx]}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        [tier.idx]: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    {t('qexp.field.tiers.row', { n: tier.moq ?? tier.idx + 1 })}
                    {tier.eau != null ? ` · ${tier.eau} pcs` : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {errMsg && (
          <div className="qe-error-banner" role="alert">
            {errMsg}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          className="op-btn op-btn-ghost"
          onClick={handleClose}
          disabled={false}
        >
          {t('qexp.action.cancel')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-primary"
          onClick={handleExport}
          disabled={submitDisabled}
        >
          {submitting ? (
            <>
              <span className="qe-spinner" aria-hidden="true" />
              <span>{t('qexp.progress.exporting')}</span>
            </>
          ) : (
            t('qexp.action.export')
          )}
        </button>
      </Modal.Footer>
    </Modal>
  );
}

function buildSubtitle(quote) {
  if (!quote) return undefined;
  const id = `#${quote.id}`;
  const label = quote.state?.rfq_number || quote.state?.ccl_pn || quote.label || '';
  const cu = quote.state?.end_cu || quote.state?.direct_cu || quote.state?.project || '';
  const ver = quote._version != null ? ` · v${quote._version}` : '';
  const parts = [id, label, cu].filter(Boolean);
  return parts.join(' · ') + ver;
}
