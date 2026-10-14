/**
 * serverIdentity.js — server identity helpers for the SERVER setup wizard.
 *
 * Sprint Phase A.1 (build infrastructure for cross-platform distribution).
 * Captured per-server fields beyond the existing license / data / network /
 * admin steps:
 *
 *   - serverName    operator-entered, 3-50 chars (free text on a charset)
 *   - serverId      RFC4122 UUID v4, generated ONCE per install — IMMUTABLE
 *                   across re-runs of the wizard (50 clients cache it)
 *   - timezone      auto-detected via Intl, operator can override
 *   - language      auto-detected via app.getLocale() (vi/en only), override OK
 *   - createdAt     stamped at first generation — IMMUTABLE
 *
 * Pure helpers. The only Electron dependency is `app.getLocale()` in
 * detectLanguage() (lazy-required so unit tests can stub it). No I/O,
 * no UI, no IPC. Tested in isolation by serverIdentity.test.js.
 */

'use strict';
const crypto = require('node:crypto');

// 3-50 chars, ASCII letters / digits / spaces / underscore / dash / dot.
// Excludes punctuation that would interfere with .opsconn export or HTML
// rendering in the admin dashboard (Phase A.2).
const SERVER_NAME_RE = /^[A-Za-z0-9 _.-]{3,50}$/;

function generateServerId() {
  return crypto.randomUUID();
}

function validateServerName(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'Server name không được trống.' };
  if (!SERVER_NAME_RE.test(s)) {
    return { ok: false, error: 'Server name 3-50 ký tự, chỉ chữ/số/khoảng trắng/_-.' };
  }
  return { ok: true, value: s };
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Lazy-require Electron so this module is testable in plain Node.
function detectLanguage() {
  let locale = 'en';
  try {
    const { app } = require('electron');
    locale = (app && typeof app.getLocale === 'function' ? app.getLocale() : 'en').toLowerCase();
  } catch {
    // Electron not loaded (unit test path) — keep 'en'.
  }
  if (locale.startsWith('vi')) return 'vi';
  if (!locale.startsWith('en')) {
    // Debug-friendly: surface unsupported OS locales instead of silently
    // flipping to en. Lets a future complaint ("OS tôi không phải EN
    // sao app EN?") be answered from the boot log.

    console.log(`[setup] OS locale "${locale}" not in [vi, en], falling back to en`);
  }
  return 'en';
}

function buildFreshIdentity(serverName) {
  return {
    serverName: String(serverName || '').trim(),
    serverId: generateServerId(),
    timezone: detectTimezone(),
    language: detectLanguage(),
    createdAt: new Date().toISOString(),
  };
}

// Merge operator-entered updates into an EXISTING identity, preserving
// serverId + createdAt. Used on re-run of the wizard (Sprint 1.5
// "Re-run setup wizard" feature). 50 clients cached the original
// serverId; mutating it = mass connection loss.
function mergeIdentity(existing, updates) {
  return {
    ...existing,
    serverName: updates.serverName ?? existing.serverName,
    timezone: updates.timezone ?? existing.timezone,
    language: updates.language ?? existing.language,
    // serverId + createdAt are intentionally NOT spread from updates
  };
}

module.exports = {
  SERVER_NAME_RE,
  generateServerId,
  validateServerName,
  detectTimezone,
  detectLanguage,
  buildFreshIdentity,
  mergeIdentity,
};
