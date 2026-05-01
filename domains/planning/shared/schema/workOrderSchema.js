/**
 * Inline schema validators for MES-1.4 routes.
 *
 * Hand-rolled (zero-dep) per repo convention — see server/middleware/validate.js
 * for the legacy precedent. Each validator returns an array of error
 * objects `{ field, code, msg? }`; an empty array means valid. The route
 * layer maps a non-empty array to a 400 RFC-7807 problem document with
 * `errors` as an extension member.
 */
import { WO_OP_TYPES } from '../constants/workOrderStates.js';
import { HEADER_PATCHABLE_FIELDS } from '../../server/repositories/workOrderRepo.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reqStr(field, v, max, errors) {
  if (typeof v !== 'string' || v.length === 0) {
    errors.push({ field, code: 'required' });
  } else if (max != null && v.length > max) {
    errors.push({ field, code: 'too_long', max });
  }
}
function optStr(field, v, max, errors) {
  if (v == null) return;
  if (typeof v !== 'string') errors.push({ field, code: 'type', expected: 'string' });
  else if (max != null && v.length > max) errors.push({ field, code: 'too_long', max });
}
function reqNum(field, v, opts, errors) {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) errors.push({ field, code: 'required' });
  else if (opts?.min != null && n < opts.min) errors.push({ field, code: 'min', min: opts.min });
  else if (opts?.max != null && n > opts.max) errors.push({ field, code: 'max', max: opts.max });
}
function optNum(field, v, opts, errors) {
  if (v == null) return;
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) errors.push({ field, code: 'type', expected: 'number' });
  else if (opts?.min != null && n < opts.min) errors.push({ field, code: 'min', min: opts.min });
  else if (opts?.max != null && n > opts.max) errors.push({ field, code: 'max', max: opts.max });
}
function reqDate(field, v, errors) {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) errors.push({ field, code: 'iso_date' });
}

export function validateCreate(body = {}) {
  const errors = [];
  optStr('code', body.code, 32, errors);
  reqStr('ccl_pn', body.ccl_pn, 64, errors);
  reqStr('customer', body.customer, 128, errors);
  reqNum('qty_planned', body.qty_planned, { min: 0.000001, max: 1e9 }, errors);
  reqStr('uom', body.uom, 16, errors);
  reqDate('due_date', body.due_date, errors);
  optNum('priority', body.priority, { min: 1, max: 9 }, errors);
  optNum('sales_order_id', body.sales_order_id, { min: 1 }, errors);
  optStr('rfq_no', body.rfq_no, 64, errors);
  return errors;
}

export function validatePatch(body = {}) {
  const errors = [];
  const forbidden = Object.keys(body).filter((k) => !HEADER_PATCHABLE_FIELDS.includes(k));
  if (forbidden.length > 0) {
    return [{ field: '_root', code: 'forbidden_fields', forbidden_fields: forbidden }];
  }
  optStr('customer', body.customer, 128, errors);
  optNum('qty_planned', body.qty_planned, { min: 0.000001, max: 1e9 }, errors);
  if (body.due_date != null) reqDate('due_date', body.due_date, errors);
  optNum('priority', body.priority, { min: 1, max: 9 }, errors);
  optNum('sales_order_id', body.sales_order_id, { min: 1 }, errors);
  optStr('rfq_no', body.rfq_no, 64, errors);
  return errors;
}

export function validateRelease(body = {}) {
  const errors = [];
  optStr('notes', body.notes, 500, errors);
  return errors;
}

export function validateCancel(body = {}) {
  const errors = [];
  reqStr('reason', body.reason, 500, errors);
  return errors;
}

export function validateAddOperation(body = {}) {
  const errors = [];
  optNum('seq', body.seq, { min: 1, max: 1e6 }, errors);
  if (typeof body.op_type !== 'string' || !WO_OP_TYPES.includes(body.op_type)) {
    errors.push({ field: 'op_type', code: 'enum', values: [...WO_OP_TYPES] });
  }
  reqStr('work_centre_no', body.work_centre_no, 32, errors);
  if (body.planned_start != null && !ISO_DATETIME.test(body.planned_start)) {
    errors.push({ field: 'planned_start', code: 'iso_datetime' });
  }
  if (body.planned_end != null && !ISO_DATETIME.test(body.planned_end)) {
    errors.push({ field: 'planned_end', code: 'iso_datetime' });
  }
  optNum('setup_minutes_plan', body.setup_minutes_plan, { min: 0, max: 1e6 }, errors);
  optNum('run_minutes_plan', body.run_minutes_plan, { min: 0, max: 1e6 }, errors);
  optStr('notes', body.notes, 500, errors);
  return errors;
}

export function parseListQuery(query = {}) {
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, 200));
  const offset = Math.max(0, Number(query.offset) || 0);
  const out = { limit, offset };
  if (typeof query.status === 'string' && query.status) out.status = query.status;
  if (typeof query.q === 'string' && query.q) out.q = query.q;
  if (typeof query.from === 'string' && ISO_DATE.test(query.from)) out.from = query.from;
  if (typeof query.to === 'string' && ISO_DATE.test(query.to)) out.to = query.to;
  return out;
}
