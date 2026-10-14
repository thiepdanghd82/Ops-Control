/**
 * librarySchema — lightweight schema validator for server/data/Library/*
 *
 * Motivation: Sprint 11 P0-1. dataSync.js used to JSON.parse library
 * files with zero struct checks, so a corrupt / hostile drop-in (the
 * `Library/` folder is trusted but operators can manually drop .js
 * files from IFS exports) could inject arbitrary keys into
 * PermissionGroups, MachineProfiles, or pricing Rate tables. Those
 * keys then drive auth / pricing calculations — a silent integrity
 * failure in the worst place.
 *
 * Design:
 *   - Hand-rolled, zero-dependency. Adding Zod would mean `npm install`
 *     on the remote Windows prod box, which the playbook explicitly
 *     avoids for package-footprint reasons.
 *   - Row-level validator: walks an array of records and validates each
 *     against a schema. Records failing validation are DROPPED (not
 *     rejected wholesale) — one bad row mustn't break the whole load.
 *   - Unknown keys are PRESERVED (passthrough) so partial schemas work
 *     while we incrementally pin shapes. Stricter `strict: true` mode
 *     strips unknowns — use for security-critical loads (permissions).
 *   - Validation failures are logged to stderr with file context; in
 *     prod, the ops audit log picks these up.
 *
 * API:
 *   const schema = {
 *     id: { type: 'string', required: true, maxLen: 64 },
 *     name: { type: 'string', required: true },
 *     price: { type: 'number', min: 0 },
 *     tags: { type: 'array', of: { type: 'string' } },
 *   };
 *   const { rows, dropped, errors } = validateRows(inputRows, schema, {
 *     strict: true, source: 'PermissionGroups/groups.json',
 *   });
 */

const TYPE_CHECKERS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  any: () => true,
};

function coerceValue(v, type) {
  // Opportunistic coercion for fields that come through JSON-with-stringly-typed
  // numbers (e.g. "3.175" instead of 3.175 from xlsx exports). Only
  // used when the raw value fails the type check — never stripping data.
  if (type === 'number' || type === 'integer') {
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      const n = Number(v);
      return type === 'integer' ? Math.trunc(n) : n;
    }
  }
  if (type === 'boolean') {
    if (v === 'true' || v === 1) return true;
    if (v === 'false' || v === 0) return false;
  }
  return v;
}

function validateField(row, key, spec, errors, path) {
  const raw = row[key];
  const present = raw !== undefined && raw !== null && raw !== '';

  if (!present) {
    if (spec.required) {
      errors.push(`${path}.${key} is required (missing)`);
      return { ok: false, value: undefined };
    }
    return { ok: true, value: spec.default !== undefined ? spec.default : raw };
  }

  let value = raw;
  let typeOk = TYPE_CHECKERS[spec.type]?.(value) ?? true;
  if (!typeOk) {
    const coerced = coerceValue(value, spec.type);
    if (TYPE_CHECKERS[spec.type]?.(coerced)) {
      value = coerced;
      typeOk = true;
    }
  }
  if (!typeOk) {
    errors.push(
      `${path}.${key} expected ${spec.type}, got ${typeof raw} (${JSON.stringify(raw).slice(0, 60)})`
    );
    return { ok: false, value: undefined };
  }

  if (spec.enum && !spec.enum.includes(value)) {
    errors.push(
      `${path}.${key} must be one of [${spec.enum.join(', ')}], got ${JSON.stringify(value)}`
    );
    return { ok: false, value: undefined };
  }
  if (spec.type === 'string' && spec.maxLen != null && value.length > spec.maxLen) {
    errors.push(`${path}.${key} length ${value.length} exceeds maxLen ${spec.maxLen}`);
    return { ok: false, value: undefined };
  }
  if ((spec.type === 'number' || spec.type === 'integer') && spec.min != null && value < spec.min) {
    errors.push(`${path}.${key} value ${value} below min ${spec.min}`);
    return { ok: false, value: undefined };
  }
  if ((spec.type === 'number' || spec.type === 'integer') && spec.max != null && value > spec.max) {
    errors.push(`${path}.${key} value ${value} above max ${spec.max}`);
    return { ok: false, value: undefined };
  }
  if (spec.type === 'array' && spec.of) {
    // Per-item validation. Drops bad items but keeps the array.
    const cleaned = [];
    for (let i = 0; i < value.length; i++) {
      const itemErrors = [];
      const r = validateField({ _: value[i] }, '_', spec.of, itemErrors, `${path}.${key}[${i}]`);
      if (r.ok) cleaned.push(r.value);
      else errors.push(...itemErrors);
    }
    value = cleaned;
  }
  if (spec.validate && typeof spec.validate === 'function') {
    const msg = spec.validate(value, row);
    if (msg) {
      errors.push(`${path}.${key}: ${msg}`);
      return { ok: false, value: undefined };
    }
  }
  return { ok: true, value };
}

/**
 * Validate an array of rows against a schema.
 * @param {Array} rows        Input records.
 * @param {Object} schema     Field → spec map.
 * @param {Object} opts
 * @param {boolean} [opts.strict]  Drop unknown keys (default: passthrough).
 * @param {string} [opts.source]   File path / label for error messages.
 * @param {boolean} [opts.silent]  Suppress stderr log on errors.
 * @returns {{ rows: Array, dropped: number, errors: string[] }}
 */
export function validateRows(rows, schema, opts = {}) {
  const { strict = false, source = '<anonymous>', silent = false } = opts;
  const errors = [];
  const out = [];
  let dropped = 0;

  if (!Array.isArray(rows)) {
    const msg = `${source}: expected top-level array, got ${typeof rows}`;
    if (!silent) console.error('[librarySchema]', msg);
    return { rows: [], dropped: 0, errors: [msg] };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(
        `${source}[${i}]: expected object, got ${Array.isArray(row) ? 'array' : typeof row}`
      );
      dropped++;
      continue;
    }

    const rowErrors = [];
    const cleaned = strict ? {} : { ...row };

    // Strip unknown keys in strict mode — applied BEFORE validation so
    // permissive fields don't leak through. Keys listed in schema are
    // always preserved.
    if (strict) {
      for (const k of Object.keys(schema)) {
        if (k in row) cleaned[k] = row[k];
      }
    }

    let rowDropped = false;
    for (const [key, spec] of Object.entries(schema)) {
      const r = validateField(cleaned, key, spec, rowErrors, `${source}[${i}]`);
      if (!r.ok) {
        if (spec.required) {
          // Missing/invalid required field → drop whole row.
          rowDropped = true;
          break;
        }
        // Non-required-field failure → strip the invalid value so
        // downstream consumers can't see corrupt data. In passthrough
        // mode the key was spread in from the raw row, so explicit
        // delete is needed.
        delete cleaned[key];
        continue;
      }
      if (r.value !== undefined) cleaned[key] = r.value;
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    }

    if (rowDropped) {
      dropped++;
    } else {
      out.push(cleaned);
    }
  }

  if (errors.length > 0 && !silent) {
    const head = errors
      .slice(0, 5)
      .map((e) => `  · ${e}`)
      .join('\n');
    const tail = errors.length > 5 ? `\n  · …and ${errors.length - 5} more` : '';
    console.error(
      `[librarySchema] ${source}: ${errors.length} validation issue(s), ${dropped} row(s) dropped\n${head}${tail}`
    );
  }

  return { rows: out, dropped, errors };
}

// ─────────────────────────────────────────────────────────────────
// Canonical schemas for security-critical library files.
// Add new schemas here as we pin more shapes — each schema here makes
// a load safer against corrupt / hostile inputs.
// ─────────────────────────────────────────────────────────────────

/** PermissionGroups/groups.json — drives auth. STRICT. */
export const permissionGroupSchema = {
  id: { type: 'string', required: true, maxLen: 64 },
  name: { type: 'string', required: true, maxLen: 128 },
  default_department: { type: 'string', maxLen: 64 },
  notes: { type: 'string', maxLen: 2000 },
  is_system: { type: 'boolean' },
  tab_permissions: { type: 'object' }, // { [tabId: string]: 'hidden'|'read'|'edit' }
};

/** MachineProfiles rows — drive layout optimizer + pricing. */
export const machineProfileSchema = {
  id: { type: 'string', required: true, maxLen: 64 },
  name: { type: 'string', required: true, maxLen: 128 },
  press_type: { type: 'string', enum: ['rotary', 'flat'] },
  tooth_count_max: { type: 'integer', min: 0, max: 2000 },
  tooth_pitch_mm: { type: 'number', min: 0, max: 100 },
  web_width_min_mm: { type: 'number', min: 0, max: 10000 },
  web_width_max_mm: { type: 'number', min: 0, max: 10000 },
  max_pitch_mm: { type: 'number', min: 0, max: 10000 },
  speed_max_m_min: { type: 'number', min: 0, max: 10000 },
  num_print_stations: { type: 'integer', min: 0, max: 50 },
  num_diecut_stations: { type: 'integer', min: 0, max: 50 },
  plate_dies: { type: 'array' },
  magnetic_dies: { type: 'array' },
  notes: { type: 'string', maxLen: 4000 },
};

/** Rate/rate_sites.json site entries — drive pricing. */
export const rateRowSchema = {
  workcenter: { type: 'string', required: true, maxLen: 128 },
  rate: { type: 'number', required: true, min: 0 },
  currency: { type: 'string', maxLen: 8 },
  capacity_min_h: { type: 'number', min: 0 },
  setup_min: { type: 'number', min: 0 },
  effective_from: { type: 'string', maxLen: 40 },
  notes: { type: 'string', maxLen: 1000 },
};

/**
 * Safe wrapper over JSON.parse for library files. Returns null + logs
 * on parse failure instead of throwing, so one bad file can't take
 * down the whole load.
 */
export function safeParseJson(content, source) {
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error(`[librarySchema] ${source}: JSON.parse failed — ${e.message}`);
    return null;
  }
}
