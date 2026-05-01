/**
 * MES-1.7 — Add Operation modal.
 *
 * `seq` is server-suggested (max(existing.seq) + 10, or 10 for the
 * first op) and shown as read-only info in the modal — the operator
 * can't tweak it from this UI; if they need a custom seq, the planner
 * console (post-MES-2) will expose drag-reorder.
 */
import { useMemo, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useI18n } from '../../../utils/useI18n';
import { addOperation } from './api';
import { WO_OP_TYPES } from './constants';
import { Field, mapServerErrors } from './formHelpers';

function validate(form) {
  const errors = {};
  if (!form.op_type) errors.op_type = 'required';
  if (!form.work_centre_no?.trim()) errors.work_centre_no = 'required';
  else if (form.work_centre_no.length > 32) errors.work_centre_no = 'too_long';
  if (form.planned_start && form.planned_end && form.planned_end <= form.planned_start) {
    errors.planned_end = 'end_before_start';
  }
  for (const k of ['setup_minutes_plan', 'run_minutes_plan']) {
    if (form[k] !== '' && form[k] != null) {
      const n = Number(form[k]);
      if (!Number.isFinite(n) || n < 0) errors[k] = 'non_negative';
    }
  }
  if (form.notes && form.notes.length > 500) errors.notes = 'too_long';
  return errors;
}

export default function AddOperationModal({ wo, onClose, onSuccess }) {
  const { t } = useI18n();
  const suggestedSeq = useMemo(() => {
    const max = (wo.operations || []).reduce((m, op) => Math.max(m, op.seq || 0), 0);
    return max === 0 ? 10 : max + 10;
  }, [wo.operations]);
  const [form, setForm] = useState({
    op_type: 'FLEXO',
    work_centre_no: '',
    planned_start: '',
    planned_end: '',
    setup_minutes_plan: '',
    run_minutes_plan: '',
    notes: '',
  });
  const [pending, setPending] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const clientErrors = useMemo(() => validate(form), [form]);
  const errors = { ...clientErrors, ...serverErrors };
  const isValid = Object.keys(clientErrors).length === 0;

  function set(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
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
        op_type: form.op_type,
        work_centre_no: form.work_centre_no.trim(),
        ...(form.planned_start ? { planned_start: form.planned_start } : {}),
        ...(form.planned_end ? { planned_end: form.planned_end } : {}),
        ...(form.setup_minutes_plan !== ''
          ? { setup_minutes_plan: Number(form.setup_minutes_plan) }
          : {}),
        ...(form.run_minutes_plan !== ''
          ? { run_minutes_plan: Number(form.run_minutes_plan) }
          : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      };
      const op = await addOperation(wo.id, payload);
      onSuccess(op);
    } catch (e) {
      setServerErrors(mapServerErrors(e));
      setPending(false);
    }
  }

  const errMsg = (key) => (errors[key] ? t(`planning.workOrder.addOp.error.${errors[key]}`) : null);

  return (
    <Modal open onClose={pending ? undefined : onClose} size="md" severity="info">
      <Modal.Header
        title={t('planning.workOrder.addOp.title', { code: wo.code })}
        subtitle={t('planning.workOrder.addOp.suggested_seq', { seq: suggestedSeq })}
      />
      <Modal.Body>
        <div className="wo-form-grid wo-form-grid-md">
          <Field label={t('planning.workOrder.ops.col.op_type')} required err={errMsg('op_type')}>
            <select
              className="wo-form-input"
              value={form.op_type}
              onChange={(e) => set('op_type', e.target.value)}
              disabled={pending}
            >
              {WO_OP_TYPES.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('planning.workOrder.ops.col.work_centre_no')}
            required
            err={errMsg('work_centre_no')}
          >
            <input
              className="wo-form-input"
              value={form.work_centre_no}
              maxLength={32}
              onChange={(e) => set('work_centre_no', e.target.value)}
              disabled={pending}
              autoFocus
            />
          </Field>
          <Field
            label={t('planning.workOrder.ops.col.planned_start')}
            err={errMsg('planned_start')}
          >
            <input
              className="wo-form-input"
              type="datetime-local"
              value={form.planned_start}
              onChange={(e) => set('planned_start', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.addOp.planned_end')} err={errMsg('planned_end')}>
            <input
              className="wo-form-input"
              type="datetime-local"
              value={form.planned_end}
              onChange={(e) => set('planned_end', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field
            label={t('planning.workOrder.addOp.setup_minutes')}
            err={errMsg('setup_minutes_plan')}
          >
            <input
              className="wo-form-input"
              type="number"
              min="0"
              step="0.1"
              value={form.setup_minutes_plan}
              onChange={(e) => set('setup_minutes_plan', e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t('planning.workOrder.addOp.run_minutes')} err={errMsg('run_minutes_plan')}>
            <input
              className="wo-form-input"
              type="number"
              min="0"
              step="0.1"
              value={form.run_minutes_plan}
              onChange={(e) => set('run_minutes_plan', e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
        <Field label={t('planning.workOrder.addOp.notes')} err={errMsg('notes')}>
          <textarea
            className="wo-modal-textarea"
            value={form.notes}
            maxLength={600}
            rows={2}
            onChange={(e) => set('notes', e.target.value)}
            disabled={pending}
          />
        </Field>
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
          {pending ? t('planning.workOrder.action.pending') : t('planning.workOrder.addOp.submit')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
