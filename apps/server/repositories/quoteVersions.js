/**
 * Quote version history — append-only log with dedup + retention.
 *
 * Called from /save-all whenever a quote is updated. Behavior:
 *  1. Compute SHA256 of state_json.
 *  2. If the latest row for this quote has the SAME hash, skip (no-op).
 *     Prevents spamming versions on every save-click when nothing changed.
 *  3. Otherwise append with version_num = max(existing) + 1.
 *  4. Prune oldest rows if per-quote count exceeds MAX_VERSIONS.
 *
 * Non-fatal: any DB error logs and returns {ok:false}. Never blocks the
 * caller (save-all already succeeded on the JS-file side).
 */
import fs from 'fs';
import crypto from 'crypto';
import { getDb, getDbPath } from '../db/connection.js';
import { initSchema } from '../db/init.js';

const MAX_VERSIONS = Number(process.env.OPS_MAX_QUOTE_VERSIONS || 20);

function hashState(stateJson) {
  return crypto.createHash('sha256').update(stateJson).digest('hex');
}

export function appendQuoteVersion(quoteId, state, { savedAt, savedBy } = {}) {
  if (!quoteId || !state) return { ok: false, error: 'missing quoteId or state' };
  try {
    if (!fs.existsSync(getDbPath())) return { ok: false, error: 'ops.db not found' };
    const db = getDb();
    initSchema();

    const stateJson = typeof state === 'string' ? state : JSON.stringify(state);
    const stateHash = hashState(stateJson);

    // Skip if the latest version has identical hash → nothing to record.
    const latest = db
      .prepare(
        `
      SELECT version_num, state_hash FROM quote_versions
      WHERE quote_id = ? ORDER BY version_num DESC LIMIT 1
    `
      )
      .get(quoteId);

    if (latest && latest.state_hash === stateHash) {
      return { ok: true, skipped: true, reason: 'no changes since last version' };
    }

    const nextVer = (latest?.version_num || 0) + 1;
    const savedAtISO = savedAt || new Date().toISOString();

    // Insert + prune in one transaction so concurrent saves don't create
    // gaps in version_num or leave stale rows behind.
    const tx = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO quote_versions (quote_id, version_num, state_json, saved_at, saved_by, state_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(quoteId, nextVer, stateJson, savedAtISO, savedBy || null, stateHash);

      // Retention: keep only the most recent MAX_VERSIONS rows per quote.
      const count = db
        .prepare(`SELECT COUNT(*) AS n FROM quote_versions WHERE quote_id = ?`)
        .get(quoteId).n;
      if (count > MAX_VERSIONS) {
        const excess = count - MAX_VERSIONS;
        db.prepare(
          `
          DELETE FROM quote_versions
          WHERE id IN (
            SELECT id FROM quote_versions
            WHERE quote_id = ?
            ORDER BY version_num ASC
            LIMIT ?
          )
        `
        ).run(quoteId, excess);
      }
    });
    tx();

    return { ok: true, version: nextVer };
  } catch (err) {
    console.warn(`[quoteVersions] append failed for quote ${quoteId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** List versions (newest first) for a given quote. */
export function listQuoteVersions(quoteId, { limit = MAX_VERSIONS } = {}) {
  try {
    if (!fs.existsSync(getDbPath())) return [];
    const db = getDb();
    return db
      .prepare(
        `
      SELECT version_num, saved_at, saved_by, state_hash
      FROM quote_versions
      WHERE quote_id = ?
      ORDER BY version_num DESC
      LIMIT ?
    `
      )
      .all(quoteId, Math.max(1, Math.min(limit, 100)));
  } catch (err) {
    console.warn(`[quoteVersions] list failed:`, err.message);
    return [];
  }
}

/**
 * Recursive diff between two state objects. Returns array of changes:
 *   { path: 'moq', op: 'changed', from: 1000, to: 2000 }
 *   { path: 'materials.3.price', op: 'changed', from: 0.5, to: 0.6 }
 *   { path: 'materials.5', op: 'added', to: {...} }
 *   { path: 'inks.2', op: 'removed', from: {...} }
 *
 * Primitives compared with !==. Arrays compared index-by-index; shorter
 * array on one side produces added/removed entries. Objects compared
 * key-by-key. Avoids infinite recursion via max depth guard.
 */
export function diffQuoteStates(fromState, toState, { maxDepth = 12 } = {}) {
  const changes = [];
  walk(fromState, toState, '', 0);
  return changes;

  function walk(a, b, prefix, depth) {
    if (depth > maxDepth) {
      if (JSON.stringify(a) !== JSON.stringify(b))
        changes.push({ path: prefix || '(root)', op: 'changed', from: '…', to: '…' });
      return;
    }
    if (a === b) return;
    // Both null/undefined-ish
    if (a == null && b == null) return;
    // One side missing
    if (a == null) {
      changes.push({ path: prefix || '(root)', op: 'added', to: b });
      return;
    }
    if (b == null) {
      changes.push({ path: prefix || '(root)', op: 'removed', from: a });
      return;
    }
    // Array vs array
    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      for (let i = 0; i < maxLen; i++)
        walk(a[i], b[i], prefix ? `${prefix}.${i}` : String(i), depth + 1);
      return;
    }
    // Object vs object
    if (typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) walk(a[k], b[k], prefix ? `${prefix}.${k}` : k, depth + 1);
      return;
    }
    // Primitive mismatch
    if (a !== b) changes.push({ path: prefix || '(root)', op: 'changed', from: a, to: b });
  }
}

/** Fetch one specific version's state_json for diff or rollback. */
export function getQuoteVersion(quoteId, versionNum) {
  try {
    if (!fs.existsSync(getDbPath())) return null;
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT version_num, state_json, saved_at, saved_by
      FROM quote_versions
      WHERE quote_id = ? AND version_num = ?
    `
      )
      .get(quoteId, versionNum);
    if (!row) return null;
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      state = row.state_json;
    }
    return { version_num: row.version_num, saved_at: row.saved_at, saved_by: row.saved_by, state };
  } catch (err) {
    console.warn(`[quoteVersions] get failed:`, err.message);
    return null;
  }
}
