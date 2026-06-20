// @ts-check
/**
 * Audit log hash-chain primitives — Phase 2.2 of Debug Playbook
 * (2026-06-20). Foundation only: pure functions for canonical-JSON +
 * SHA-256 chaining + chain verification. Does NOT wire into
 * authService.audit() or migrate SQLite schema; those are Phase 2.2a
 * + 2.2b (load-bearing changes deferred per "1 PR = 1 purpose" rule).
 *
 * THE CHAIN CONTRACT
 * ──────────────────
 * Each audit entry stores `prev_hash` (SHA-256 hex of the previous
 * entry's `hash` field) and its own `hash` (SHA-256 hex of
 * `prev_hash + canonicalJson(entry_without_chain_fields)`).
 *
 * Tampering detection: re-walking the chain from the genesis entry,
 * recomputing each `hash`, and comparing against stored hash will
 * surface the FIRST broken index. Insertion, deletion, or mutation
 * of any entry breaks the chain at that point.
 *
 * Genesis entry: an explicit `CHAIN_INIT` event written ONCE at chain
 * activation. Its `prev_hash` is SHA-256 of pre-chain audit history
 * (a "best-effort" forensic anchor — not a cryptographic proof of
 * pre-chain integrity, but a fingerprint future auditors can compare
 * against archival backups).
 *
 * CANONICAL JSON
 * ──────────────
 * Strict ordered keys matching the established audit row shape
 * (ts, event, user, ip, detail). Chain fields (prev_hash, hash) are
 * EXCLUDED — they're derived metadata, not part of the entry's
 * forensic content. Adding a future field to row shape requires
 * extending `canonicalEntryJson` AND rolling forward — old chains
 * verify under old contract, new chains verify under new.
 *
 * USAGE (future caller code, not wired here):
 *
 *   import { appendHashed, verifyChain } from './auditChain.js';
 *   const next = appendHashed(prevHash, { ts, event, user, ip, detail });
 *   // → { ts, event, user, ip, detail, prev_hash: prevHash, hash: '<hex>' }
 *
 *   const { ok, breakIndex, message } = verifyChain(rows);
 *   if (!ok) console.error(`Chain broken at index ${breakIndex}: ${message}`);
 */

import { createHash } from 'node:crypto';

/** Canonical entry field order — DO NOT REORDER without bumping a chain version. */
const CANONICAL_FIELDS = /** @type {const} */ (['ts', 'event', 'user', 'ip', 'detail']);

/** Fields that participate in chain metadata (excluded from hash input). */
const CHAIN_FIELDS = new Set(['prev_hash', 'hash']);

/**
 * @typedef {{
 *   ts: string,
 *   event: string,
 *   user?: string,
 *   ip?: string,
 *   detail?: string,
 *   prev_hash?: string,
 *   hash?: string
 * }} AuditEntry
 */

/**
 * Produce canonical JSON for an audit entry — strict field order,
 * normalised defaults, excluded chain fields. Determinism is critical:
 * the same entry must always serialize to the same string across
 * Node versions / V8 micro-versions.
 *
 * @param {AuditEntry} entry
 * @returns {string}
 */
export function canonicalEntryJson(entry) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of CANONICAL_FIELDS) {
    // Default to '-' for user/ip and '' for detail to match the
    // shape that `authService.audit()` writes today (lines 1136-1143).
    const v = entry[k];
    if (k === 'user' || k === 'ip') out[k] = v || '-';
    else if (k === 'detail') out[k] = v || '';
    else out[k] = String(v ?? '');
  }
  return JSON.stringify(out);
}

/**
 * Compute the chain hash for an entry given the previous entry's hash.
 * Input format: `<prev_hash> + <canonical_entry_json>` — both required
 * to defeat re-ordering attacks (without prev_hash, an attacker could
 * shuffle entries and recompute hashes; with it, shuffle breaks every
 * downstream hash).
 *
 * @param {string | null} prevHash  — hex string OR null for genesis entry.
 * @param {AuditEntry} entry        — entry to hash (chain fields ignored).
 * @returns {string}                — sha256 hex.
 */
export function hashEntry(prevHash, entry) {
  const input = String(prevHash || '') + canonicalEntryJson(entry);
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Return a NEW entry with prev_hash + hash attached. Original entry
 * is not mutated. Caller is responsible for persisting the result.
 *
 * @param {string | null} prevHash
 * @param {AuditEntry} entry
 * @returns {AuditEntry & { prev_hash: string, hash: string }}
 */
export function appendHashed(prevHash, entry) {
  const prev = prevHash || '';
  const hash = hashEntry(prev, entry);
  return { ...entry, prev_hash: prev, hash };
}

/**
 * Compute the SHA-256 fingerprint of the pre-chain audit history.
 * Used by the genesis CHAIN_INIT entry as its `prev_hash` so future
 * auditors can compare the genesis fingerprint against archival
 * backups of the pre-chain state.
 *
 * NOT a cryptographic proof of pre-chain integrity — pre-chain entries
 * have no per-row hash, so an attacker who mutated them BEFORE chain
 * activation leaves no trace. The fingerprint is a best-effort
 * forensic anchor for the chain-activation moment.
 *
 * @param {AuditEntry[]} preChainRows
 * @returns {string}
 */
export function preChainFingerprint(preChainRows) {
  const canonical = preChainRows.map(canonicalEntryJson).join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Build the genesis CHAIN_INIT entry.
 *
 * @param {{ ts: string, user?: string, ip?: string, preChainRows?: AuditEntry[] }} opts
 * @returns {AuditEntry & { prev_hash: string, hash: string }}
 */
export function buildGenesisEntry(opts) {
  const preChainHash = preChainFingerprint(opts.preChainRows || []);
  const entry = {
    ts: opts.ts,
    event: 'CHAIN_INIT',
    user: opts.user || 'system',
    ip: opts.ip || '-',
    detail: JSON.stringify({
      pre_chain_row_count: (opts.preChainRows || []).length,
      pre_chain_sha256: preChainHash,
      chain_version: 1,
    }),
  };
  // Genesis hashes itself with prev_hash = preChainHash (NOT empty
  // string) so the chain anchors to the pre-chain fingerprint.
  return appendHashed(preChainHash, entry);
}

/**
 * Verify a chain of audit entries. Starts from the first entry whose
 * `event === 'CHAIN_INIT'` (pre-chain entries are accepted as legacy
 * and skipped — their integrity cannot be proven retroactively).
 *
 * Returns { ok: true } if every chained entry's hash matches its
 * recomputed value.
 *
 * Returns { ok: false, breakIndex, message } where breakIndex is the
 * 0-based index INTO THE ORIGINAL ROWS ARRAY (not the chain subset)
 * of the FIRST broken entry. Possible breakages:
 *   - Mutated entry (hash doesn't match recomputed)
 *   - Inserted entry (prev_hash doesn't match previous entry's hash)
 *   - Deleted entry (next prev_hash doesn't match previous hash)
 *   - Reordered entries (same as above — breaks downstream chain)
 *
 * @param {AuditEntry[]} rows
 * @returns {{ ok: boolean, breakIndex?: number, message?: string, chainStart?: number, chainLength?: number }}
 */
export function verifyChain(rows) {
  if (!Array.isArray(rows)) {
    return { ok: false, message: 'rows must be an array' };
  }
  if (rows.length === 0) {
    return { ok: true, chainStart: -1, chainLength: 0 };
  }

  // Find the genesis CHAIN_INIT entry. Pre-chain entries before it
  // are accepted as legacy + skipped in verification.
  const chainStart = rows.findIndex((r) => r && r.event === 'CHAIN_INIT');
  if (chainStart === -1) {
    return {
      ok: true,
      chainStart: -1,
      chainLength: 0,
      message:
        'No CHAIN_INIT genesis entry found — log is entirely pre-chain (legacy). Run migrate-audit-chain-init to anchor a new chain.',
    };
  }

  // Walk the chain from genesis. The genesis entry's hash is
  // recomputed from its OWN prev_hash (the pre-chain fingerprint),
  // so we treat it like any other entry.
  let chainLength = 0;
  let prevHash = rows[chainStart].prev_hash;
  for (let i = chainStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') {
      return { ok: false, breakIndex: i, message: `Entry at index ${i} is not an object` };
    }
    if (!r.hash || !r.prev_hash) {
      // First post-genesis entry without chain fields = chain broke
      // at the boundary (entry was inserted or chain wasn't extended).
      return {
        ok: false,
        breakIndex: i,
        message: `Entry at index ${i} (event=${r.event}) is missing chain fields (prev_hash/hash) after genesis — chain ended without continuation`,
      };
    }
    if (r.prev_hash !== prevHash) {
      return {
        ok: false,
        breakIndex: i,
        chainStart,
        chainLength,
        message:
          `Entry at index ${i} (event=${r.event}, ts=${r.ts}) has prev_hash=${r.prev_hash.slice(0, 12)}... ` +
          `but previous entry's hash was ${(prevHash || '').slice(0, 12)}... — entry inserted/deleted/reordered upstream`,
      };
    }
    const expected = hashEntry(prevHash, r);
    if (r.hash !== expected) {
      return {
        ok: false,
        breakIndex: i,
        chainStart,
        chainLength,
        message:
          `Entry at index ${i} (event=${r.event}, ts=${r.ts}) has hash=${r.hash.slice(0, 12)}... ` +
          `but expected ${expected.slice(0, 12)}... — entry content was mutated after hashing`,
      };
    }
    prevHash = r.hash;
    chainLength++;
  }
  return { ok: true, chainStart, chainLength };
}
