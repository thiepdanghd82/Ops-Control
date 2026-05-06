/**
 * Reason-code admin service — Sprint MES-3-V2 (KIOSK-002).
 *
 * CRUD + validation on top of the `reason_code` table seeded by
 * `seedReasonCodes.js`. The schema uses `category` (downtime|quality|
 * planned|other), NOT `severity` — kept for backward-compat with the
 * 8 default codes already in production. New entries follow the same
 * shape.
 *
 * Soft-delete only: `disable` flips active→0; `enable` flips 0→1. No
 * row is ever physically deleted, so historical pause events keep
 * resolvable labels (the kiosk pause endpoint validates active=1, so
 * disabled codes vanish from the picker but remain joinable from the
 * audit log).
 *
 * Audit: every mutation emits a single audit row via the injected
 * `audit({ ts, event, user, ip?, detail })` closure (same shape as
 * mountPlanning's wiring). Detail is a JSON.stringify-ed payload.
 */
import { BmesError } from '../errors.js';

const VALID_CATEGORIES = new Set(['downtime', 'quality', 'planned', 'other']);
const CODE_RE = /^[A-Z][A-Z0-9_]{1,31}$/;
const LABEL_MAX = 80;
const PATCH_FIELDS = ['label_en', 'label_vn', 'category', 'sort_order'];

function trimNonEmpty(s, max = LABEL_MAX) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

function validateCreate(input) {
  const errors = [];
  if (typeof input !== 'object' || !input) {
    errors.push({ field: '_root', code: 'object_required' });
    return errors;
  }
  if (!CODE_RE.test(String(input.code || ''))) {
    errors.push({ field: 'code', code: 'pattern' });
  }
  if (!trimNonEmpty(input.label_en)) errors.push({ field: 'label_en', code: 'required' });
  if (!trimNonEmpty(input.label_vn)) errors.push({ field: 'label_vn', code: 'required' });
  if (!VALID_CATEGORIES.has(input.category)) {
    errors.push({ field: 'category', code: 'enum' });
  }
  if (input.sort_order != null) {
    const n = Number(input.sort_order);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      errors.push({ field: 'sort_order', code: 'range' });
    }
  }
  return errors;
}

function validatePatch(input) {
  const errors = [];
  if (typeof input !== 'object' || !input) {
    errors.push({ field: '_root', code: 'object_required' });
    return errors;
  }
  const keys = Object.keys(input);
  const forbidden = keys.filter((k) => !PATCH_FIELDS.includes(k));
  if (forbidden.length > 0) {
    // Tagging on `_root` so the route layer can render the canonical
    // forbidden-fields envelope (matches workOrder PATCH error shape).
    errors.push({ field: '_root', code: 'forbidden_fields', forbidden_fields: forbidden });
    return errors;
  }
  if (keys.length === 0) errors.push({ field: '_root', code: 'empty_patch' });
  if ('label_en' in input && !trimNonEmpty(input.label_en)) {
    errors.push({ field: 'label_en', code: 'required' });
  }
  if ('label_vn' in input && !trimNonEmpty(input.label_vn)) {
    errors.push({ field: 'label_vn', code: 'required' });
  }
  if ('category' in input && !VALID_CATEGORIES.has(input.category)) {
    errors.push({ field: 'category', code: 'enum' });
  }
  if ('sort_order' in input) {
    const n = Number(input.sort_order);
    if (!Number.isFinite(n) || n < 0 || n > 9999) {
      errors.push({ field: 'sort_order', code: 'range' });
    }
  }
  return errors;
}

export function createReasonCodeService({ db, audit }) {
  function emit(event, actor, detail, ts = new Date().toISOString()) {
    audit({ ts, event, user: actor, detail: JSON.stringify(detail) });
  }

  function findByCode(code) {
    return db.prepare('SELECT * FROM reason_code WHERE code = ?').get(code) || null;
  }

  function list({ includeDisabled = false } = {}) {
    const sql = includeDisabled
      ? 'SELECT * FROM reason_code ORDER BY active DESC, sort_order ASC, code ASC'
      : 'SELECT * FROM reason_code WHERE active = 1 ORDER BY sort_order ASC, code ASC';
    return db.prepare(sql).all();
  }

  function create(input, actor) {
    const errors = validateCreate(input);
    if (errors.length) throw new BmesError('urn:ops:validation', { errors });

    const code = input.code;
    if (findByCode(code)) {
      throw new BmesError('urn:ops:reason-code-collision', { code });
    }

    const row = {
      code,
      label_en: input.label_en.trim(),
      label_vn: input.label_vn.trim(),
      category: input.category,
      sort_order: input.sort_order != null ? Number(input.sort_order) : 100,
      active: 1,
    };

    let inserted;
    db.transaction(() => {
      db.prepare(
        `INSERT INTO reason_code (code, label_en, label_vn, category, sort_order, active)
         VALUES (?, ?, ?, ?, ?, 1)`
      ).run(row.code, row.label_en, row.label_vn, row.category, row.sort_order);
      inserted = findByCode(code);
      emit('REASON_CODE_CREATE', actor, {
        code: inserted.code,
        label_en: inserted.label_en,
        label_vn: inserted.label_vn,
        category: inserted.category,
        sort_order: inserted.sort_order,
      });
    })();
    return inserted;
  }

  function update(code, patch, actor) {
    const errors = validatePatch(patch);
    if (errors.length) {
      // Forbidden-fields shape collapses into its own type so the route
      // can render { type: 'urn:ops:reason-code-forbidden-fields' }.
      const root = errors.find((e) => e.field === '_root' && e.code === 'forbidden_fields');
      if (root) {
        throw new BmesError('urn:ops:reason-code-forbidden-fields', {
          forbidden_fields: root.forbidden_fields,
        });
      }
      throw new BmesError('urn:ops:validation', { errors });
    }
    const before = findByCode(code);
    if (!before) throw new BmesError('urn:ops:reason-code-not-found', { code });

    const sets = [];
    const params = [];
    const changed = {};
    for (const k of PATCH_FIELDS) {
      if (k in patch) {
        const newVal =
          k === 'sort_order'
            ? Number(patch[k])
            : typeof patch[k] === 'string'
              ? patch[k].trim()
              : patch[k];
        if (before[k] !== newVal) {
          sets.push(`${k} = ?`);
          params.push(newVal);
          changed[k] = { from: before[k], to: newVal };
        }
      }
    }
    if (sets.length === 0) {
      // Treat as no-op (operator submitted same values as before). Same
      // 'no-change' contract used in workOrderTransition; route maps
      // this to 200 with the unchanged row.
      return before;
    }
    params.push(code);
    let after;
    db.transaction(() => {
      db.prepare(`UPDATE reason_code SET ${sets.join(', ')} WHERE code = ?`).run(...params);
      after = findByCode(code);
      emit('REASON_CODE_UPDATE', actor, {
        code,
        fields_changed: Object.keys(changed),
        changes: changed,
      });
    })();
    return after;
  }

  function disable(code, actor) {
    const before = findByCode(code);
    if (!before) throw new BmesError('urn:ops:reason-code-not-found', { code });
    if (before.active === 0) {
      throw new BmesError('urn:ops:reason-code-already-disabled', { code });
    }
    let after;
    db.transaction(() => {
      db.prepare('UPDATE reason_code SET active = 0 WHERE code = ?').run(code);
      after = findByCode(code);
      emit('REASON_CODE_DISABLE', actor, { code });
    })();
    return after;
  }

  function enable(code, actor) {
    const before = findByCode(code);
    if (!before) throw new BmesError('urn:ops:reason-code-not-found', { code });
    if (before.active === 1) {
      throw new BmesError('urn:ops:reason-code-already-enabled', { code });
    }
    let after;
    db.transaction(() => {
      db.prepare('UPDATE reason_code SET active = 1 WHERE code = ?').run(code);
      after = findByCode(code);
      emit('REASON_CODE_ENABLE', actor, { code });
    })();
    return after;
  }

  return { list, findByCode, create, update, disable, enable };
}

// Exported for unit testing the validators in isolation.
export { validateCreate, validatePatch, VALID_CATEGORIES, CODE_RE };
