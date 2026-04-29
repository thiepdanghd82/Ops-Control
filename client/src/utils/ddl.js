/**
 * DDL (drop-down list) key lookups.
 *
 * Historical context: COST V1.0 stored the "design process" list under the
 * key `process_design`, but later code expected `design_process`. Both keys
 * ended up being probed inline across several components, with the typo-prone
 * fallback `lib?.ddl?.process_design || lib?.ddl?.design_process`. Centralize
 * here so any future rename happens in one place.
 */

const DDL_ALIASES = {
  designProcess: ['process_design', 'design_process'],
};

function lookupList(lib, aliases) {
  const ddl = lib && lib.ddl;
  if (!ddl) return [];
  for (const key of aliases) {
    const v = ddl[key];
    if (Array.isArray(v) && v.length) return v.filter(Boolean);
  }
  // Log once so misconfigured library data is visible instead of silently empty.
  if (typeof window !== 'undefined' && !window.__ddlMissWarned) {
    window.__ddlMissWarned = new Set();
  }
  const tag = aliases.join('|');
  if (typeof window !== 'undefined' && window.__ddlMissWarned && !window.__ddlMissWarned.has(tag)) {
    window.__ddlMissWarned.add(tag);
    console.warn(`[ddl] No list found for aliases [${tag}] — returning empty.`);
  }
  return [];
}

export function getDesignProcessList(lib) {
  return lookupList(lib, DDL_ALIASES.designProcess);
}
