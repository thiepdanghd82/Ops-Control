/**
 * Migration: reason-codes admin tab seeding (KIOSK-002, MES-3-V2).
 *
 * Backfills the `reason-codes` tab into operator-runtime `groups.json`
 * so admins assigned to non-default permission groups see the new tab
 * in the matrix without an ops-team SQL fix.
 *
 * Pattern mirrors `2026-05-kiosk-admin-perms.js`: idempotent, fail-safe,
 * preserve operator customisation. Default value policy:
 *   - `all_access`     → 'edit'   (sys-admin shortcut)
 *   - `leader_default` → 'edit'   (matches the seeded baseline)
 *   - everything else  → 'hidden' (privileged tab — opt-in only)
 *
 * Run from the CLI:
 *   node scripts/migrations/2026-05-reason-codes-tab.js
 *
 * Environment overrides:
 *   OPS_DATA_DIR  — explicit path to the data dir (defaults to ./server/data)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAB_ID = 'reason-codes';
const TAB_LABEL = 'Reason Codes';
const EDIT_GROUPS = new Set(['all_access', 'leader_default']);

/**
 * @param {string} dataDir
 * @param {{ logger?: { log: Function, warn: Function, error: Function } }} [opts]
 * @returns {{ applied: boolean, reason?: string, groups_touched?: number, tab_catalog_added?: boolean }}
 */
export function migrate(dataDir, opts = {}) {
  const logger = opts.logger || console;
  const groupsPath = path.join(dataDir, 'Library', 'PermissionGroups', 'groups.json');

  if (!fs.existsSync(groupsPath)) {
    logger.log(
      '[migration:reason-codes-tab] groups.json missing — skipping (fresh install will seed via mountPlanning)'
    );
    return { applied: false, reason: 'no_groups_file' };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
  } catch (err) {
    logger.error(
      `[migration:reason-codes-tab] groups.json is not valid JSON: ${err.message} — bailing out (manual fix required)`
    );
    return { applied: false, reason: 'invalid_json' };
  }

  let mutated = false;
  let tabCatalogAdded = false;

  const catalog = Array.isArray(raw._tab_catalog) ? raw._tab_catalog : [];
  if (!catalog.find((t) => t && t.id === TAB_ID)) {
    catalog.push({ id: TAB_ID, label: TAB_LABEL });
    raw._tab_catalog = catalog;
    mutated = true;
    tabCatalogAdded = true;
  }

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
    logger.log('[migration:reason-codes-tab] no-op (already applied)');
    return { applied: false, reason: 'already_applied' };
  }

  fs.writeFileSync(groupsPath, JSON.stringify(raw, null, 2) + '\n');
  logger.log(
    `[migration:reason-codes-tab] applied — tab_catalog_added=${tabCatalogAdded}, groups_touched=${touched}/${groups.length}`
  );
  return { applied: true, tab_catalog_added: tabCatalogAdded, groups_touched: touched };
}

const __filename = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isCli) {
  const dataDir = process.env.OPS_DATA_DIR
    ? path.resolve(process.env.OPS_DATA_DIR)
    : path.resolve(path.dirname(__filename), '..', '..', 'server', 'data');
  migrate(dataDir);
}
