/**
 * Migration: kiosk-admin permission seeding (KIOSK-006b, MES-3-V1).
 *
 * Backfills the `kiosk-admin` tab into existing operator-runtime
 * `groups.json` files. MES-2.7 added kiosk-admin to the dev-box
 * `_tab_catalog` + 7 group entries, but `groups.json` is gitignored
 * (operator runtime data) so production deploys arrived without the
 * new tab in their permission matrix. Symptom: admins assigned to a
 * non-default group could not see the kiosk-admin tab post-deploy
 * until ops manually edited the JSON.
 *
 * Idempotent + fail-safe:
 *   - Re-running on an already-migrated file is a no-op (no writes).
 *   - Existing operator customisations on the kiosk-admin permission
 *     are preserved — we only fill in MISSING values, never overwrite.
 *   - Missing groups.json is logged + treated as "fresh install will
 *     pick up via seed" (return without writing).
 *   - Any thrown error is caught by the caller (mountPlanning) so a
 *     migration glitch never blocks server boot.
 *
 * Default value policy:
 *   - `all_access`     → 'edit'   (sys-admin shortcut)
 *   - `leader_default` → 'edit'   (matches the seeded baseline)
 *   - everything else  → 'hidden' (privileged tab — opt-in only)
 *
 * Run from the CLI:
 *   node scripts/migrations/2026-05-kiosk-admin-perms.js
 *
 * Environment overrides:
 *   OPS_DATA_DIR  — explicit path to the data dir (defaults to ./server/data)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAB_ID = 'kiosk-admin';
const TAB_LABEL = 'Kiosk Admin';
const EDIT_GROUPS = new Set(['all_access', 'leader_default']);

/**
 * Run the migration against a given `dataDir` (the directory that
 * contains `Library/PermissionGroups/groups.json`).
 *
 * @param {string} dataDir
 * @param {{ logger?: { log: Function, warn: Function, error: Function } }} [opts]
 * @returns {{ applied: boolean, reason?: string, groups_touched?: number, tab_catalog_added?: boolean }}
 */
export function migrate(dataDir, opts = {}) {
  const logger = opts.logger || console;
  const groupsPath = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');

  if (!fs.existsSync(groupsPath)) {
    logger.log(
      '[migration:kiosk-admin-perms] groups.json missing — skipping (fresh install will seed via mountPlanning)'
    );
    return { applied: false, reason: 'no_groups_file' };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
  } catch (err) {
    logger.error(
      `[migration:kiosk-admin-perms] groups.json is not valid JSON: ${err.message} — bailing out (manual fix required)`
    );
    return { applied: false, reason: 'invalid_json' };
  }

  let mutated = false;
  let tabCatalogAdded = false;

  // 1. Ensure the tab is in the catalog (visible in the permission UI).
  const catalog = Array.isArray(raw._tab_catalog) ? raw._tab_catalog : [];
  if (!catalog.find((t) => t && t.id === TAB_ID)) {
    catalog.push({ id: TAB_ID, label: TAB_LABEL });
    raw._tab_catalog = catalog;
    mutated = true;
    tabCatalogAdded = true;
  }

  // 2. Backfill tab_permissions[kiosk-admin] for every group that
  //    doesn't already have an explicit value. Operator customisations
  //    (anything other than `undefined`) are preserved as-is.
  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  let touched = 0;
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    if (!g.tab_permissions || typeof g.tab_permissions !== 'object') {
      g.tab_permissions = {};
    }
    if (g.tab_permissions[TAB_ID] === undefined) {
      g.tab_permissions[TAB_ID] = EDIT_GROUPS.has(g.id) ? 'edit' : 'hidden';
      mutated = true;
      touched += 1;
    }
  }

  if (!mutated) {
    logger.log('[migration:kiosk-admin-perms] no-op (already applied)');
    return { applied: false, reason: 'already_applied' };
  }

  // Serialise with the same 2-space indent used by the rest of the
  // codebase's Library/ JSON files. Trailing newline matches POSIX.
  fs.writeFileSync(groupsPath, JSON.stringify(raw, null, 2) + '\n');
  logger.log(
    `[migration:kiosk-admin-perms] applied — tab_catalog_added=${tabCatalogAdded}, groups_touched=${touched}/${groups.length}`
  );
  return { applied: true, tab_catalog_added: tabCatalogAdded, groups_touched: touched };
}

// CLI mode — `node scripts/migrations/2026-05-kiosk-admin-perms.js`
const __filename = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isCli) {
  const dataDir = process.env.OPS_DATA_DIR
    ? path.resolve(process.env.OPS_DATA_DIR)
    : path.resolve(path.dirname(__filename), '..', '..', 'server', 'data');
  migrate(dataDir);
}
