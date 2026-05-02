/**
 * MES-1.7 — Create Work Order modal.
 *
 * Client-side validation mirrors the server contract (PRD §7.1 +
 * domains/planning/shared/schema/workOrderSchema.js validateCreate).
 * Server-side errors[] are mapped back onto field-level inline errors
 * so an operator sees exactly which input is wrong.
 *
 * Submit success → onSuccess(newWo) → parent navigates to the new WO's
 * detail page (FR-12 — operator can create + add op + release in <30s).
 */
import { useMemo, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import { createWorkOrder } from './api';
import { Field, mapServerErrors } from './formHelpers';

const TODAY = () => new Date().toISOString().slice(0, 10);

function validate(form) {
  const errors = {};
  if (!form.ccl_pn?.trim()) errors.ccl_pn = 'required';
  else if (form.ccl_pn.length > 64) errors.ccl_pn = 'too_long';
  if (!form.customer?.trim()) errors.customer = 'required';
  else if (form.customer.length > 128) errors.customer = 'too_long';
  const qty = Number(form.qty_planned);
  if (!Number.isFinite(qty) || qty <= 0) errors.qty_planned = 'positive_number';
  if (!form.uom?.trim()) errors.uom = 'required';
  else if (form.uom.length > 16) errors.uom = 'too_long';
  if (!form.due_date) errors.due_date = 'required';
  else if (form.due_date < TODAY()) errors.due_date = 'past';
  if (form.priority !== '' && form.priority != null) {
    const p = Number(form.priority);
    if (!Number.isInteger(p) || p < 1 || p > 9) errors.priority = 'range_1_9';
  }
  if (form.code && form.code.length > 32) errors.code = 'too_long';
  if (form.rfq_no && form.rfq_no.length > 64) errors.rfq_no = 'too_long';
  return errors;
}

export default function CreateWorkOrderModal({ onClose, onSuccess }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    code: '',
    ccl_pn: '',
    customer: '',
    qty_planned: '',
    uom: 'PCS',
    due_date: '',
    priority: 5,
    sales_order_id: '',
    rfq_no: '',
  });
  const [pending, setPending] = useState(false);
  const [serverErrors, setServerErrors] = useState({});

  const clientErrors = useMemo(() => validate(form), [form]);
  const errors = { ...clientErrors, ...serverErrors };
  const isValid = Object.keys(clientErrors).length === 0;

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (serverErrors[key])
      setServerErrors((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
  }

  async function handleSubmit() {
    setPending(true);
    setServerErrors({});
    try {
      const payload = {
        ccl_pn: form.ccl_pn.trim(),
        customer: form.customer.trim(),
        qty_planned: Number(form.qty_planned),
        uom: form.uom.trim(),
        due_date: form.due_date,
        priority: Number(form.priority) || 5,
        ...(form.code ? { code: form.code.trim() } : {}),
        ...(form.sales_order_id ? { sales_order_id: Number(form.sales_order_id) } : {}),
        ...(form.rfq_no ? { rfq_no: form.rfq_no.trim() } : {}),
      };
      const wo = await createWorkOrder(payload);
      onSuccess(wo);
    } catch (e) {
      setServerErrors(mapServerErrors(e));
      setPending(false);
    }
  }

  const errMsg = (key) =>
    errors[key] ? t(`planning.workOrder.create.error.${errors[key]}`) : null;

  return (
    <Modal open onClose={pending ? undefined : onClose} size="lg" severity="info">
      <Modal.Header title={t('planning.workOrder.create.title')} />
      <Modal.Body>
        <div className="wo-form-grid">
          <Field label={t('planning.workOrder.col.ccl_pn')} required err={errMsg('ccl_pn')}>
            <input
              className="wo-form-input"
              value={form.ccl_pn}
              maxLength={64}
              onChange={(e) => set('ccl_pn', e.target.value)}
              disabled={pending}
              autoFocus
            />
          </Field>
          <Field label={t('planning.workOrder.col.customer')} required err={errMsg('customer')}>
            <input
              className="wo-form-input"
              value={form.customer}
              maxLength={128}
              onChange={(e) => set('customer', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field
            label={t('planning.workOrder.col.qty_planned')}
            required
            err={errMsg('qty_planned')}
          >
            <input
              className="wo-form-input"
              type="number"
              min="0.001"
              step="0.001"
              value={form.qty_planned}
              onChange={(e) => set('qty_planned', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.create.uom')} required err={errMsg('uom')}>
            <input
              className="wo-form-input"
              value={form.uom}
              maxLength={16}
              onChange={(e) => set('uom', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.col.due_date')} required err={errMsg('due_date')}>
            <input
              className="wo-form-input"
              type="date"
              min={TODAY()}
              value={form.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.create.priority')} err={errMsg('priority')}>
            <input
              className="wo-form-input"
              type="number"
              min="1"
              max="9"
              step="1"
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.create.code_optional')} err={errMsg('code')}>
            <input
              className="wo-form-input"
              value={form.code}
              maxLength={32}
              placeholder={t('planning.workOrder.create.code_placeholder')}
              onChange={(e) => set('code', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.create.rfq_no')} err={errMsg('rfq_no')}>
            <input
              className="wo-form-input"
              value={form.rfq_no}
              maxLength={64}
              onChange={(e) => set('rfq_no', e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
        {serverErrors._root ? <div className="wo-modal-error">{serverErrors._root}</div> : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose} disabled={pending}>
          {t('planning.workOrder.action.cancel')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-primary"
          onClick={handleSubmit}
          disabled={pending || !isValid}
        >
          {pending ? t('planning.workOrder.action.pending') : t('planning.workOrder.create.submit')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
