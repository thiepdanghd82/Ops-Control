/**
 * ReasonCodeFormModal — shared create + edit modal (MES-3-V2 KIOSK-002).
 *
 * Mode prop:
 *   - 'create' → all fields editable, Submit calls onCreate(payload)
 *   - 'edit'   → `code` is locked (immutable identifier), Submit calls
 *                onUpdate(code, patch). Patch only carries changed fields.
 *
 * Surfaces the server's RFC-7807 envelope:
 *   - `urn:ops:reason-code-collision` → "Code already exists"
 *   - `urn:ops:validation`            → field-level red text
 */
import { useEffect, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';

const CODE_RE = /^[A-Z][A-Z0-9_]{1,31}$/;
const CATEGORIES = ['downtime', 'quality', 'planned', 'other'];

function emptyForm() {
  return {
    code: '',
    label_en: '',
    label_vn: '',
    category: 'other',
    sort_order: 100,
  };
}

export default function ReasonCodeFormModal({ mode, row, onCancel, onCreate, onUpdate }) {
  const { t } = useI18n();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          code: row.code,
          label_en: row.label_en || '',
          label_vn: row.label_vn || '',
          category: row.category || 'other',
          sort_order: row.sort_order ?? 100,
        }
      : emptyForm()
  );
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverErr, setServerErr] = useState(null);

  // Reset state on mode change so a stale form from the prior open
  // doesn't leak into a new modal session.
  useEffect(() => {
    setErrors({});
    setServerErr(null);
  }, [mode, row]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!isEdit && !CODE_RE.test(form.code)) e.code = t('library.reasonCodes.err.codePattern');
    if (!form.label_en.trim()) e.label_en = t('library.reasonCodes.err.required');
    if (!form.label_vn.trim()) e.label_vn = t('library.reasonCodes.err.required');
    if (!CATEGORIES.includes(form.category)) e.category = t('library.reasonCodes.err.required');
    const n = Number(form.sort_order);
    if (!Number.isFinite(n) || n < 0 || n > 9999) e.sort_order = t('library.reasonCodes.err.range');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerErr(null);
    try {
      if (isEdit) {
        // Build patch with only fields that changed — keeps audit
        // detail.fields_changed clean.
        const patch = {};
        for (const k of ['label_en', 'label_vn', 'category', 'sort_order']) {
          if (String(form[k]) !== String(row[k] ?? '')) patch[k] = form[k];
        }
        if (Object.keys(patch).length === 0) {
          onCancel();
          return;
        }
        await onUpdate(form.code, patch);
      } else {
        await onCreate({
          code: form.code,
          label_en: form.label_en.trim(),
          label_vn: form.label_vn.trim(),
          category: form.category,
          sort_order: Number(form.sort_order),
        });
      }
    } catch (e) {
      // Surface RFC-7807 codes inline.
      const body = e?.body;
      if (body?.type === 'urn:ops:reason-code-collision') {
        setErrors((prev) => ({ ...prev, code: t('library.reasonCodes.err.collision') }));
      } else if (body?.type === 'urn:ops:validation' && Array.isArray(body.errors)) {
        const fieldErrs = {};
        for (const fe of body.errors) {
          if (fe.field && fe.field !== '_root') {
            fieldErrs[fe.field] = t(`library.reasonCodes.err.${fe.code}`) || fe.code;
          }
        }
        setErrors((prev) => ({ ...prev, ...fieldErrs }));
      } else {
        setServerErr(e.message || 'Save failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onCancel} size="md" severity="info" ariaLabelledBy="rc-form-title">
      <Modal.Header
        id="rc-form-title"
        title={t(isEdit ? 'library.reasonCodes.edit' : 'library.reasonCodes.add')}
        subtitle={t('library.reasonCodes.formSubtitle')}
      />
      <Modal.Body>
        <form id="rc-form" onSubmit={submit}>
          <div className="op-form-grid">
            <div className="op-form-field">
              <label>{t('library.reasonCodes.code')} ★</label>
              <input
                className="op-form-input"
                type="text"
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                disabled={isEdit}
                placeholder="MAT_SHORT"
                autoFocus={!isEdit}
              />
              {errors.code && <div className="op-form-err">{errors.code}</div>}
              {!isEdit && <div className="op-form-hint">{t('library.reasonCodes.codeHint')}</div>}
            </div>
            <div className="op-form-field">
              <label>{t('library.reasonCodes.category')} ★</label>
              <select
                className="op-form-input"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`library.reasonCodes.category.${c}`)}
                  </option>
                ))}
              </select>
              {errors.category && <div className="op-form-err">{errors.category}</div>}
            </div>
            <div className="op-form-field">
              <label>{t('library.reasonCodes.labelEn')} ★</label>
              <input
                className="op-form-input"
                type="text"
                value={form.label_en}
                onChange={(e) => set('label_en', e.target.value)}
                placeholder="Material shortage"
                maxLength={80}
              />
              {errors.label_en && <div className="op-form-err">{errors.label_en}</div>}
            </div>
            <div className="op-form-field">
              <label>{t('library.reasonCodes.labelVi')} ★</label>
              <input
                className="op-form-input"
                type="text"
                value={form.label_vn}
                onChange={(e) => set('label_vn', e.target.value)}
                placeholder="Thiếu vật tư"
                maxLength={80}
              />
              {errors.label_vn && <div className="op-form-err">{errors.label_vn}</div>}
            </div>
            <div className="op-form-field">
              <label>{t('library.reasonCodes.sortOrder')}</label>
              <input
                className="op-form-input"
                type="number"
                min={0}
                max={9999}
                value={form.sort_order}
                onChange={(e) => set('sort_order', e.target.value)}
              />
              {errors.sort_order && <div className="op-form-err">{errors.sort_order}</div>}
            </div>
          </div>
          {serverErr && <div className="form-msg error rc-form-server-err">{serverErr}</div>}
        </form>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-secondary" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          form="rc-form"
          className="op-btn op-btn-primary"
          disabled={submitting}
        >
          {submitting ? t('common.saving') : t('common.save')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
