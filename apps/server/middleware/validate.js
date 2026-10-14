/**
 * Tiny zero-dep request validation middleware.
 *
 * Why not zod? Adding a new dep mid-project means a package.json bump and
 * `npm install` in every environment. This file covers the specific shapes
 * our critical routes need (auth/login, TOTP verify, user create/update)
 * without pulling in 10k lines of code.
 *
 * Schema is a plain object: { field: {type, required?, min?, max?, pattern?} }
 * Usage:
 *   router.post('/foo', validateBody({
 *     username: { type: 'string', required: true, min: 1, max: 64 },
 *     age: { type: 'number', min: 0 }
 *   }), handler);
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};
    const errors = [];
    for (const [field, rule] of Object.entries(schema)) {
      const v = body[field];
      const present = v !== undefined && v !== null && v !== '';
      if (rule.required && !present) {
        errors.push(`${field}: required`);
        continue;
      }
      if (!present) continue;
      if (rule.type === 'string') {
        if (typeof v !== 'string') errors.push(`${field}: must be string`);
        else {
          if (rule.min != null && v.length < rule.min)
            errors.push(`${field}: min length ${rule.min}`);
          if (rule.max != null && v.length > rule.max)
            errors.push(`${field}: max length ${rule.max}`);
          if (rule.pattern && !rule.pattern.test(v)) errors.push(`${field}: invalid format`);
        }
      } else if (rule.type === 'number') {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) errors.push(`${field}: must be a finite number`);
        else {
          if (rule.min != null && n < rule.min) errors.push(`${field}: min ${rule.min}`);
          if (rule.max != null && n > rule.max) errors.push(`${field}: max ${rule.max}`);
        }
      } else if (rule.type === 'boolean') {
        if (typeof v !== 'boolean') errors.push(`${field}: must be boolean`);
      } else if (rule.type === 'object') {
        if (typeof v !== 'object' || Array.isArray(v)) errors.push(`${field}: must be object`);
      } else if (rule.type === 'array') {
        if (!Array.isArray(v)) errors.push(`${field}: must be array`);
        else if (rule.max != null && v.length > rule.max)
          errors.push(`${field}: max ${rule.max} items`);
      } else if (rule.type === 'enum') {
        // Whitelist of literal values. Used for action names, status
        // codes — places where only a fixed set of strings is valid.
        const values = rule.values || [];
        if (!values.includes(v)) {
          errors.push(`${field}: must be one of ${values.join('|')}`);
        }
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, error: 'validation_failed', details: errors });
    }
    next();
  };
}
