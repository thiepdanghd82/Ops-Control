/**
 * permissionService — server-side enforcement of SAP-style permission
 * groups (Sprint S3 — defense-in-depth on top of client AccessGate).
 *
 * Client-side `AccessGate` already hides / disables the UI; a curl user
 * could bypass that and POST directly. This layer is the authoritative
 * gate that runs on every write endpoint.
 *
 * Exposes:
 *   - resolveTabAccess(user, tabId) → 'hidden' | 'read' | 'edit'
 *   - requireTabAccess(tabId)        → Express middleware
 *   - requireBodyTabAccess(keyMap)   → bulk-check middleware for
 *                                      /save-all style endpoints
 *
 * Resolution order matches the client AccessContext exactly:
 *   1. no user                    → 'hidden'
 *   2. role === 'sys'             → 'edit' (god mode)
 *   3. no permission_group_id     → 'edit' (legacy / unmigrated user)
 *   4. group not found            → 'edit' (graceful — group was deleted)
 *   5. tab not in group matrix    → 'edit' (unlisted tabs default to edit)
 *   6. tab perm value             → as declared ('hidden'|'read'|'edit')
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSessionUser, getTokenFromHeader } from './authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname, '..', '..'), DATA_DIR);
}
import { validateRows, permissionGroupSchema, safeParseJson } from './librarySchema.js';

const PG_FILE = path.join(DATA_DIR, 'Library', 'PermissionGroups', 'groups.json');

// In-memory cache with mtime-based invalidation. Re-read only when the
// file has been modified since we last loaded it — keeps per-request
// overhead ~microseconds.
let _cache = { mtime: 0, groups: [] };

function loadGroups() {
  try {
    const stat = fs.statSync(PG_FILE);
    if (stat.mtimeMs === _cache.mtime) return _cache.groups;
    const raw = safeParseJson(fs.readFileSync(PG_FILE, 'utf-8'), 'PermissionGroups/groups.json');
    const rawGroups = Array.isArray(raw?.groups) ? raw.groups : [];
    // STRICT validation — groups drive auth, so any unknown key is
    // stripped (defence against a hostile Library/*.json drop-in that
    // tries to inject new fields the server might trust). Rows missing
    // `id` or `name` are dropped entirely.
    const { rows: groups } = validateRows(rawGroups, permissionGroupSchema, {
      strict: true,
      source: 'PermissionGroups/groups.json',
    });
    _cache = { mtime: stat.mtimeMs, groups };
    return groups;
  } catch {
    return _cache.groups; // fall back to last-known-good; fail open
  }
}

/**
 * @param {object|null} user    session user ({ role, permission_group_id, ... })
 * @param {string} tabId        sidebar tab id (e.g. 'standard', 'rfq-tracker')
 * @returns {'hidden'|'read'|'edit'}
 */
export function resolveTabAccess(user, tabId) {
  if (!user) return 'hidden';
  if (user.role === 'sys') return 'edit';
  if (!user.permission_group_id) return 'edit';
  const groups = loadGroups();
  const g = groups.find(x => x.id === user.permission_group_id);
  if (!g) return 'edit';
  const perm = g.tab_permissions?.[tabId];
  return perm === 'hidden' || perm === 'read' || perm === 'edit' ? perm : 'edit';
}

/**
 * Express middleware factory. Blocks a request if the caller's
 * permission group doesn't grant the required mode on the tab.
 *
 * @param {string} tabId                     tab id the endpoint operates on
 * @param {'edit'|'read'} [requiredMode='edit']
 */
export function requireTabAccess(tabId, requiredMode = 'edit') {
  return function tabAccessGuard(req, res, next) {
    const cu = getSessionUser(getTokenFromHeader(req));
    if (!cu) return res.status(401).json({ error: 'Unauthorized' });
    const access = resolveTabAccess(cu, tabId);
    if (requiredMode === 'edit' && access !== 'edit') {
      return res.status(403).json({
        error: 'permission_denied',
        tab: tabId, required: 'edit', current: access,
      });
    }
    if (requiredMode === 'read' && access === 'hidden') {
      return res.status(403).json({
        error: 'permission_denied',
        tab: tabId, required: 'read', current: 'hidden',
      });
    }
    next();
  };
}

/**
 * Bulk middleware for endpoints whose body carries multiple-tab payload
 * keys (e.g. POST /save-all). Pass a map of body-key → tab-id; the
 * middleware checks that the user has 'edit' on every tab whose key is
 * present in the body. Rejects the ENTIRE request if any key fails.
 *
 * Example:
 *   requireBodyTabAccess({
 *     rfqTracker: 'rfq-tracker',
 *     sampleTracker: 'sample-tracking',
 *   })
 */
export function requireBodyTabAccess(keyMap) {
  return function bodyTabAccessGuard(req, res, next) {
    const cu = getSessionUser(getTokenFromHeader(req));
    if (!cu) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const blocked = [];
    for (const [bodyKey, tabId] of Object.entries(keyMap)) {
      if (body[bodyKey] === undefined) continue;
      const access = resolveTabAccess(cu, tabId);
      if (access !== 'edit') blocked.push({ bodyKey, tab: tabId, access });
    }
    if (blocked.length > 0) {
      return res.status(403).json({
        error: 'permission_denied',
        blocked,
        hint: 'Your permission group does not allow editing these tabs.',
      });
    }
    next();
  };
}
