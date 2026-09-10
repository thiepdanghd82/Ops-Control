/**
 * Import Pipeline — the engine driven by the dataset registry.
 *
 * Phase 1 (preview):  parse → map headers → coerce types → simulate diff
 *                     → return token + report
 * Phase 2 (commit):   look up token → final write → backup → audit
 *
 * The token-based two-phase commit prevents three classes of bugs:
 *   1. Race condition: file changes between preview and commit (sha256 binds them).
 *   2. Operator surprise: "I didn't realise this would replace the whole file."
 *      The validation report shows exact deltas before any write.
 *   3. Wasted backup churn: clicking Import 5x in a row used to create 5
 *      backups. With token-bound commits, the second click finds an
 *      already-consumed token and is rejected.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { atomicWriteFileSync } from './atomicWrite.js';
import { clearCache } from './dataSync.js';
import { getDataset, normKey, STORAGE_JS_AOA } from './importDatasets.js';
import { coerce } from './importTypeCoerce.js';
import * as shadowWrite from '../repositories/shadowWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname, '..', '..'), DATA_DIR);
}
const LIBRARY_DIR = path.join(DATA_DIR, 'Library');

// ─────────────────────────────────────────────────────────────────
// Header mapping
// ─────────────────────────────────────────────────────────────────

// Tokens that carry no field identity — units + qualifiers that appear in
// real export headers ("USD / M² PRICE", "MM THICKNESS", "DAYS LEAD TIME").
// Stripping them lets the remaining content tokens match the alias content.
const NOISE_TOKENS = new Set(['mm', 'm2', 'usd', 'vnd', 'days', 'day', 'pcs', 'no']);

/**
 * Canonicalise a header/alias string into a Set of content tokens:
 * lowercase, ²→2, strip punctuation (/ , . ( ) - # %), drop unit/noise
 * tokens, keep the rest. Deterministic. e.g. "USD / M² PRICE" → {price}.
 */
export function canonicalTokens(s) {
  const cleaned = String(s ?? '')
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/[/,.()\-#%]/g, ' ');
  const toks = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NOISE_TOKENS.has(t));
  return new Set(toks);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}
function isSubset(small, big) {
  if (small.size === 0) return false;
  for (const t of small) if (!big.has(t)) return false;
  return true;
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

/**
 * Match a raw header against an alias map `{ normKey(alias): canonical }`
 * (the shape of both `dataset.aliases` and the legacy NPI_HEADER_MAP).
 *
 * Tolerant cascade — deterministic, no fuzzy-match dependency:
 *   1. exact `aliases[normKey(h)]`           → confidence 1.0
 *   2. canonicalised token-set equal          → 0.9
 *   3. alias tokens ⊆ header tokens, OR
 *      Jaccard(header, alias) ≥ 0.6           → 0.7
 *   else (< 0.6)                              → UNMATCHED
 *
 * Highest confidence wins; ties keep the first alias encountered (insertion
 * order). Returns { canonical, confidence, status, suggestions }, where
 * status is 'matched' (≥0.9) | 'low' (≥0.6) | 'unmatched', and suggestions
 * is the top-2 nearest canonicals (by raw token overlap) for unmatched cols.
 */
export function matchHeader(rawHeader, aliases) {
  const nk = normKey(rawHeader);
  if (aliases[nk]) {
    return { canonical: aliases[nk], confidence: 1, status: 'matched', suggestions: [] };
  }
  const hTokens = canonicalTokens(rawHeader);
  let best = null; // { canonical, confidence }
  const sims = new Map(); // canonical → best raw overlap (for suggestions)
  for (const [aliasKey, canonical] of Object.entries(aliases)) {
    const aTokens = canonicalTokens(aliasKey);
    if (aTokens.size === 0) continue; // unit-only alias (e.g. "usd/m²") — skip
    const sim = jaccard(hTokens, aTokens);
    if (sim > 0 && (!sims.has(canonical) || sims.get(canonical) < sim)) {
      sims.set(canonical, sim);
    }
    let conf = 0;
    if (setsEqual(hTokens, aTokens)) conf = 0.9;
    else if (isSubset(aTokens, hTokens) || sim >= 0.6) conf = 0.7;
    if (conf > 0 && (!best || conf > best.confidence)) {
      best = { canonical, confidence: conf };
    }
  }
  if (best && best.confidence >= 0.6) {
    return {
      canonical: best.canonical,
      confidence: best.confidence,
      status: best.confidence >= 0.9 ? 'matched' : 'low',
      suggestions: [],
    };
  }
  const suggestions = [...sims.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([canonical, confidence]) => ({ canonical, confidence: +confidence.toFixed(3) }));
  return {
    canonical: null,
    confidence: best ? best.confidence : 0,
    status: 'unmatched',
    suggestions,
  };
}

/**
 * Fraction of a column's NON-EMPTY sampled cells that coerce to a number.
 * Used to disambiguate which source column feeds a number-typed canonical:
 * a real "Price" column scores ~1.0; a boolean "Use Price Incl Tax" column
 * (all `false`) scores 0. Empty cells are ignored (sparse columns are fine).
 */
function numericFitness(sampleRows, colIndex, limit = 100) {
  let seen = 0;
  let numeric = 0;
  for (let r = 0; r < sampleRows.length && seen < limit; r++) {
    const cell = sampleRows[r] ? sampleRows[r][colIndex] : undefined;
    const s = cell == null ? '' : String(cell).trim();
    if (s === '') continue;
    seen++;
    if (coerce(cell, 'number').ok) numeric++;
  }
  return seen === 0 ? 0 : numeric / seen;
}

/**
 * Resolve raw headers → the winning column index per canonical, using the
 * tolerant matcher with confidence-ranked (and optionally data-aware)
 * conflict resolution. Shared by `mapHeaders` (registry datasets) and the
 * legacy header-map importer so EVERY import path resolves identically.
 *
 * When several columns match one canonical the winner is chosen by:
 *   1. highest confidence  (exact 1.0 beats token-subset 0.7),
 *   2. data-type fitness   (for number fields: drop non-exact candidates
 *      whose sampled data is not numeric, then break ties by numeric
 *      fitness) — requires `sampleRows`,
 *   3. leftmost column.
 *
 * @param {string[]} rawHeaders
 * @param {Object}   aliases                 { normKey(alias): canonical }
 * @param {Object}   [opts]
 * @param {Iterable<string>} [opts.numberFields] canonicals that hold numbers
 * @param {Array[]}  [opts.sampleRows]       parsed data rows (data-aware tie-break)
 * @returns {{ claims: Object, matches: Array }} claims = { canonical: winningIndex }
 */
export function resolveHeaderClaims(rawHeaders, aliases, opts = {}) {
  const numberFields = new Set(opts.numberFields || []);
  const sampleRows = Array.isArray(opts.sampleRows) ? opts.sampleRows : null;
  const hasSamples = !!sampleRows && sampleRows.length > 0;
  const matches = rawHeaders.map((h, i) => ({ index: i, raw: h, ...matchHeader(h, aliases) }));
  const byCanonical = new Map();
  for (const m of matches) {
    if (!m.canonical) continue;
    if (!byCanonical.has(m.canonical)) byCanonical.set(m.canonical, []);
    byCanonical.get(m.canonical).push(m);
  }
  const claims = {};
  for (const [canonical, cands] of byCanonical) {
    const isNum = numberFields.has(canonical);
    const fit = (m) => (hasSamples ? numericFitness(sampleRows, m.index) : 0);
    let pool = cands;
    if (isNum && hasSamples) {
      // A boolean / text column can't be a number field unless its header is
      // an EXACT alias match — drop the rest so it can't steal the canonical.
      const qualified = cands.filter((m) => m.confidence >= 1 || fit(m) >= 0.3);
      if (qualified.length) pool = qualified;
    }
    pool = [...pool].sort(
      (a, b) => b.confidence - a.confidence || fit(b) - fit(a) || a.index - b.index
    );
    claims[canonical] = pool[0].index;
  }
  return { claims, matches };
}

/**
 * Given the raw headers of an uploaded file (and, optionally, the parsed
 * data rows), return:
 *   - normalisedHeaders: same length as input, with each header rewritten
 *     to its canonical form when matched (confidence ≥ 0.6), else null.
 *   - mapping: { canonical: originalIndex } — the column lookup used by
 *     the row mapper. ONE winning column per canonical.
 *   - unmapped: indexes of columns no alias matched (or that lost a
 *     canonical to a stronger column).
 *   - missing: required canonical headers that were NOT found.
 *   - columns: per-source-column report (raw, canonical, confidence,
 *     status, suggestions) so the preview never silently drops a column.
 *
 * Conflict resolution (Lesson 32): when several source columns match the
 * same canonical, the winner is chosen by HIGHEST confidence first — an
 * exact header ("Price", 1.0) always beats a token-subset match ("Use Price
 * Incl Tax", 0.7), regardless of column order. When `sampleRows` is given,
 * number-typed canonicals additionally (a) drop non-exact candidates whose
 * sampled data is not numeric (e.g. a boolean column) and (b) break ties by
 * numeric fitness — so the matcher uses BOTH the title and the data.
 */
export function mapHeaders(rawHeaders, dataset, sampleRows = null) {
  const aliases = dataset.aliases || {};
  const colTypes = dataset.columnTypes || {};
  const numberFields = Object.keys(colTypes).filter((k) => colTypes[k] === 'number');
  const normalisedHeaders = new Array(rawHeaders.length).fill(null);
  const mapping = {};
  const unmapped = [];
  const columns = [];

  // 1 + 2. Match every column, then resolve each canonical to its single best
  // column (confidence-ranked + data-aware) via the shared resolver.
  const { claims, matches } = resolveHeaderClaims(rawHeaders, aliases, {
    numberFields,
    sampleRows,
  });

  // 3. Emit per-column report + mapping using the resolved winners.
  for (const m of matches) {
    const i = m.index;
    if (m.canonical && claims[m.canonical] === i) {
      normalisedHeaders[i] = m.canonical;
      mapping[m.canonical] = i;
      columns.push({
        index: i,
        raw: m.raw,
        canonical: m.canonical,
        confidence: m.confidence,
        status: m.status,
        suggestions: m.suggestions,
      });
    } else if (m.canonical) {
      // Matched a canonical but lost it to a stronger column (higher
      // confidence / better-typed data). Report it; never silently apply it.
      unmapped.push(i);
      columns.push({
        index: i,
        raw: m.raw,
        canonical: null,
        confidence: m.confidence,
        status: 'duplicate',
        suggestions: [{ canonical: m.canonical, confidence: m.confidence }],
      });
    } else {
      unmapped.push(i);
      columns.push({
        index: i,
        raw: m.raw,
        canonical: null,
        confidence: m.confidence,
        status: 'unmatched',
        suggestions: m.suggestions,
      });
    }
  }
  const missing = (dataset.requiredHeaders || []).filter((h) => !(h in mapping));
  return { normalisedHeaders, mapping, unmapped, missing, columns };
}

/**
 * Apply column-mapping overrides from the wizard. The wizard can let the
 * operator force-map an unrecognised column to a canonical field. The
 * override shape is { columnIndex: 'CanonicalName' | null }.
 */
export function applyMappingOverrides(headerMapping, overrides, dataset) {
  if (!overrides || typeof overrides !== 'object') return headerMapping;
  const next = {
    normalisedHeaders: [...headerMapping.normalisedHeaders],
    mapping: { ...headerMapping.mapping },
    unmapped: [...headerMapping.unmapped],
    missing: [],
  };
  for (const [idxStr, canonical] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    if (!Number.isInteger(idx) || idx < 0 || idx >= next.normalisedHeaders.length) continue;
    // Drop the previous canonical for this idx (if any).
    const prev = next.normalisedHeaders[idx];
    if (prev && next.mapping[prev] === idx) delete next.mapping[prev];
    if (!canonical || canonical === '__skip__') {
      next.normalisedHeaders[idx] = null;
      if (!next.unmapped.includes(idx)) next.unmapped.push(idx);
      continue;
    }
    // Validate the override target is in the dataset's canonical list
    if (!dataset.canonicalHeaders.includes(canonical)) continue;
    // Drop any other column currently pointing at this canonical
    if (canonical in next.mapping) {
      const oldIdx = next.mapping[canonical];
      next.normalisedHeaders[oldIdx] = null;
      if (!next.unmapped.includes(oldIdx)) next.unmapped.push(oldIdx);
    }
    next.normalisedHeaders[idx] = canonical;
    next.mapping[canonical] = idx;
    next.unmapped = next.unmapped.filter((i) => i !== idx);
  }
  next.missing = (dataset.requiredHeaders || []).filter((h) => !(h in next.mapping));
  return next;
}

// ─────────────────────────────────────────────────────────────────
// Type coercion
// ─────────────────────────────────────────────────────────────────

export function coerceRows(headers, rows, dataset) {
  const types = dataset.columnTypes || {};
  const out = [];
  const issues = [];
  rows.forEach((row, rowIdx) => {
    const next = headers.map((h, i) => {
      const t = types[h];
      if (!t) return row[i] ?? '';
      const r = coerce(row[i], t);
      if (!r.ok) {
        issues.push({ row: rowIdx, col: h, raw: row[i], reason: r.reason });
        return row[i] ?? ''; // keep raw on failure so the operator can fix
      }
      return r.value == null ? '' : r.value;
    });
    out.push(next);
  });
  return { rows: out, issues };
}

// ─────────────────────────────────────────────────────────────────
// Build canonical {headers, rows} from raw parse result
// ─────────────────────────────────────────────────────────────────

/**
 * Build the canonical-shape data: the mapped columns are placed in the
 * dataset's `canonicalHeaders` order; any unmapped columns are appended
 * after, preserving their original header text (so passthrough columns
 * survive the round-trip).
 */
export function buildCanonical({ headers, rows, dataset, headerMapping, includeUnmapped = true }) {
  const canonical = dataset.canonicalHeaders;
  const extras = includeUnmapped
    ? headerMapping.unmapped.map((i) => headers[i]).filter((h) => h && String(h).trim())
    : [];
  const outHeaders = [...canonical, ...extras];
  const outRows = rows.map((row) => {
    const next = new Array(outHeaders.length).fill('');
    canonical.forEach((h, j) => {
      const srcIdx = headerMapping.mapping[h];
      if (srcIdx != null) next[j] = row[srcIdx] ?? '';
    });
    extras.forEach((origHeader, k) => {
      const srcIdx = headers.indexOf(origHeader);
      if (srcIdx >= 0) next[canonical.length + k] = row[srcIdx] ?? '';
    });
    return next;
  });
  return { headers: outHeaders, rows: outRows };
}

// ─────────────────────────────────────────────────────────────────
// Natural-key indexing + diff for upsert
// ─────────────────────────────────────────────────────────────────

function keyForRow(row, headers, naturalKey) {
  // For passthrough datasets the columns live in `headers`; for JSON-AoO
  // datasets the row IS an object so we read by canonical key directly.
  if (Array.isArray(row)) {
    return naturalKey
      .map((k) => {
        const idx = headers.indexOf(k);
        return idx >= 0
          ? String(row[idx] ?? '')
              .trim()
              .toLowerCase()
          : '';
      })
      .join('|');
  }
  // Object row
  return naturalKey
    .map((k) =>
      String(row[k] ?? '')
        .trim()
        .toLowerCase()
    )
    .join('|');
}

/**
 * Diff two row sets by natural key. Returns counts + sample rows for the
 * preview UI.
 */
export function diffRows({ existingRows, existingHeaders, newRows, newHeaders, naturalKey }) {
  const exIdx = new Map();
  for (const r of existingRows) {
    const k = keyForRow(r, existingHeaders, naturalKey);
    if (k && !exIdx.has(k)) exIdx.set(k, r);
  }
  const newIdx = new Map();
  for (const r of newRows) {
    const k = keyForRow(r, newHeaders, naturalKey);
    if (k && !newIdx.has(k)) newIdx.set(k, r);
  }

  const added = [],
    updated = [],
    unchanged = [],
    removedIfReplace = [],
    dupKeys = [];
  for (const [k, nr] of newIdx) {
    const er = exIdx.get(k);
    if (!er) {
      added.push(nr);
      continue;
    }
    if (rowsEqual(er, existingHeaders, nr, newHeaders)) unchanged.push(nr);
    else updated.push({ before: er, after: nr });
  }
  for (const [k, er] of exIdx) {
    if (!newIdx.has(k)) removedIfReplace.push(er);
  }
  // Detect duplicate natural keys WITHIN the upload itself
  const seen = new Map();
  for (const r of newRows) {
    const k = keyForRow(r, newHeaders, naturalKey);
    if (!k) continue;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) dupKeys.push({ key: k, count: n });

  return {
    counts: {
      added: added.length,
      updated: updated.length,
      unchanged: unchanged.length,
      removedIfReplace: removedIfReplace.length,
      duplicates: dupKeys.length,
    },
    samples: {
      added: added.slice(0, 5),
      updated: updated.slice(0, 5),
      removedIfReplace: removedIfReplace.slice(0, 5),
      duplicates: dupKeys.slice(0, 5),
    },
  };
}

function rowsEqual(rA, hA, rB, hB) {
  if (Array.isArray(rA) && Array.isArray(rB)) {
    // Compare by union of headers — values for headers absent in one
    // side count as ''.
    const all = new Set([...hA, ...hB]);
    for (const h of all) {
      const a = rA[hA.indexOf(h)];
      const b = rB[hB.indexOf(h)];
      if (String(a ?? '').trim() !== String(b ?? '').trim()) return false;
    }
    return true;
  }
  if (!Array.isArray(rA) && !Array.isArray(rB)) {
    const all = new Set([...Object.keys(rA), ...Object.keys(rB)]);
    for (const k of all) {
      if (String(rA[k] ?? '').trim() !== String(rB[k] ?? '').trim()) return false;
    }
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Storage I/O
// ─────────────────────────────────────────────────────────────────

export function datasetFilePath(dataset) {
  return path.join(LIBRARY_DIR, dataset.storage.folder, dataset.storage.file);
}

export function readExisting(dataset) {
  const p = datasetFilePath(dataset);
  if (!fs.existsSync(p)) {
    if (dataset.storage.kind === STORAGE_JS_AOA) return { headers: [], rows: [] };
    return [];
  }
  const content = fs.readFileSync(p, 'utf-8');
  if (dataset.storage.kind === STORAGE_JS_AOA) {
    // Format: window._VAR={headers:[...],rows:[...]};   (or .{headers,rows} with surrounding text)
    const m = content.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!m) return { headers: [], rows: [] };
    try {
      const parsed = JSON.parse(m[1]);
      return {
        headers: Array.isArray(parsed.headers) ? parsed.headers : [],
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      };
    } catch {
      return { headers: [], rows: [] };
    }
  }
  // STORAGE_JSON_AOO
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDataset(dataset, payload) {
  const p = datasetFilePath(dataset);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (dataset.storage.kind === STORAGE_JS_AOA) {
    const content = `${dataset.storage.varName}=${JSON.stringify({
      headers: payload.headers,
      rows: payload.rows,
    })};`;
    atomicWriteFileSync(p, content);
  } else {
    atomicWriteFileSync(p, JSON.stringify(payload, null, 2));
  }
}

// Default retention for the wizard's per-dataset sibling backups.
// Independent of the legacy Library/Backup retention (managed in backupPath.js)
// because these live next to the source file, not in the backup root, and
// have a different naming pattern.
const WIZARD_BACKUP_KEEP = Number(process.env.OPS_IMPORT_BACKUP_KEEP) || 20;

export function backupDataset(dataset) {
  const p = datasetFilePath(dataset);
  if (!fs.existsSync(p)) return null;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const backup = path.join(dir, `${base}_backup_${ts}${ext}`);
  fs.copyFileSync(p, backup);
  // Auto-prune: keep the N most recent backups, delete older. Without this,
  // a high-churn dataset (e.g. nightly NPI imports for a year) accumulates
  // 365 backup files. Failures here are non-fatal — the new backup is safe
  // even if pruning errors.
  pruneDatasetBackups(dataset, WIZARD_BACKUP_KEEP);
  return backup;
}

export function pruneDatasetBackups(dataset, keep = WIZARD_BACKUP_KEEP) {
  try {
    const backups = listBackups(dataset); // sorted newest first by ts
    if (backups.length <= keep) return { ok: true, deleted: 0, kept: backups.length };
    const dir = path.dirname(datasetFilePath(dataset));
    const toDelete = backups.slice(keep);
    let deleted = 0;
    for (const b of toDelete) {
      try {
        fs.unlinkSync(path.join(dir, b.file));
        deleted++;
      } catch {
        /* ignore one-file failure */
      }
    }
    return { ok: true, deleted, kept: backups.length - deleted };
  } catch {
    return { ok: false, deleted: 0, kept: 0 };
  }
}

export function listBackups(dataset) {
  const p = datasetFilePath(dataset);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) return [];
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  const re = new RegExp(`^${escapeRegex(base)}_backup_\\d{15}${escapeRegex(ext)}$`);
  return fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return {
        file: f,
        size: st.size,
        modified: st.mtime.toISOString(),
        ts: f.match(/_backup_(\d{15})/)[1],
      };
    })
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────
// Shadow-write dispatcher
// ─────────────────────────────────────────────────────────────────

export function dispatchShadowWrite(dataset, rowsAsObjects) {
  if (!dataset.shadow?.writer) return;
  const fn = shadowWrite[dataset.shadow.writer];
  if (typeof fn !== 'function') return;
  try {
    if (dataset.shadow.writerArg) fn(rowsAsObjects, dataset.shadow.writerArg);
    else fn(rowsAsObjects);
  } catch (err) {
    console.warn('[import] shadow-write failed for', dataset.key, '-', err.message);
  }
}

export function dispatchShadowClear(dataset) {
  if (!dataset.shadow?.clearer) return;
  const fn = shadowWrite[dataset.shadow.clearer];
  if (typeof fn !== 'function') return;
  try {
    if (dataset.shadow.clearerArg) fn(dataset.shadow.clearerArg);
    else fn();
  } catch (err) {
    console.warn('[import] shadow-clear failed for', dataset.key, '-', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// Token store (in-memory, TTL'd, session-bound)
// ─────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const _tokens = new Map();

export function createPreviewToken(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  _tokens.set(token, { ...payload, createdAt: Date.now() });
  return token;
}

export function consumePreviewToken(token) {
  const entry = _tokens.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    _tokens.delete(token);
    return null;
  }
  _tokens.delete(token); // single-use
  return entry;
}

export function _resetTokens() {
  _tokens.clear();
}

// Sweep stale tokens AND orphaned stage files every 5 minutes.
// Stage files are written by /preview and consumed by /commit. If the operator
// abandons the wizard between phases (closes browser, walks away), the stage
// file becomes a disk leak — no process is going to clean it up. Without TTL
// sweep, a process running for weeks accumulates them. Files are unlinked when
// older than TOKEN_TTL_MS + 5 min grace (covers commits in flight at expiry).
//
// Each Map iteration is O(N) on token count; in practice N stays low (operators
// don't preview hundreds of files concurrently), and we only run every 5 min
// so total CPU cost is negligible. .unref() so the interval doesn't block exit.
const STAGE_GRACE_MS = TOKEN_TTL_MS + 5 * 60 * 1000;

function sweepWizardStage() {
  const now = Date.now();
  for (const [k, v] of _tokens) {
    if (now - v.createdAt > TOKEN_TTL_MS) _tokens.delete(k);
  }
  // Also walk the stage directory and unlink files past the grace window.
  // The stage directory location is decided by the route module; export a
  // setter the route can call on init, default to no-op until configured.
  if (typeof _stageDir === 'string' && _stageDir) {
    try {
      const entries = fs.readdirSync(_stageDir);
      for (const name of entries) {
        const p = path.join(_stageDir, name);
        try {
          const st = fs.statSync(p);
          if (st.isFile() && now - st.mtimeMs > STAGE_GRACE_MS) {
            fs.unlinkSync(p);
          }
        } catch {
          /* ignore one-file failure */
        }
      }
    } catch {
      /* dir missing — wizard never used yet */
    }
  }
}
setInterval(sweepWizardStage, 5 * 60 * 1000).unref?.();

// Configured by the route module on import (avoids circular dep).
let _stageDir = null;
export function configureStageDir(dir) {
  _stageDir = dir;
}

// ─────────────────────────────────────────────────────────────────
// AoA → AoO (for shadow-write + JSON datasets)
// ─────────────────────────────────────────────────────────────────

export function rowsAsObjects(headers, rows) {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

// ─────────────────────────────────────────────────────────────────
// Apply commit modes
// ─────────────────────────────────────────────────────────────────

/**
 * Merge new canonical rows into existing dataset rows according to mode.
 *
 * mode:
 *   'replace' — drop existing entirely, write new
 *   'append'  — concat new to existing (no key check; duplicates allowed)
 *   'upsert'  — by naturalKey: update if exists, append otherwise
 */
export function mergeRows({ existing, newCanonical, dataset, mode = 'upsert' }) {
  if (mode === 'replace') {
    if (dataset.storage.kind === STORAGE_JS_AOA) return newCanonical;
    return rowsAsObjects(newCanonical.headers, newCanonical.rows);
  }
  if (mode === 'append') {
    if (dataset.storage.kind === STORAGE_JS_AOA) {
      // Preserve existing headers; pad new rows to fit if columns overlap.
      const headers = existing.headers.length ? existing.headers : newCanonical.headers;
      const padded = newCanonical.rows.map((r) =>
        headers.map((h) => {
          const idx = newCanonical.headers.indexOf(h);
          return idx >= 0 ? r[idx] : '';
        })
      );
      return { headers, rows: [...existing.rows, ...padded] };
    }
    const existingArr = Array.isArray(existing) ? existing : [];
    return [...existingArr, ...rowsAsObjects(newCanonical.headers, newCanonical.rows)];
  }
  // upsert
  const naturalKey = dataset.naturalKey;
  if (dataset.storage.kind === STORAGE_JS_AOA) {
    const headers = existing.headers.length
      ? mergeHeaderUnion(existing.headers, newCanonical.headers)
      : newCanonical.headers;
    const exIdx = new Map();
    for (const r of existing.rows) {
      const k = keyForRow(r, existing.headers, naturalKey);
      if (k) exIdx.set(k, r);
    }
    const result = [];
    const seenKeys = new Set();
    // First, walk new rows: each one either replaces an existing entry (by key) or is added.
    for (const r of newCanonical.rows) {
      const k = keyForRow(r, newCanonical.headers, naturalKey);
      const padded = headers.map((h) => {
        const idx = newCanonical.headers.indexOf(h);
        return idx >= 0 ? r[idx] : '';
      });
      result.push(padded);
      if (k) seenKeys.add(k);
    }
    // Then, walk existing rows and append any whose key was NOT in the new set.
    for (const r of existing.rows) {
      const k = keyForRow(r, existing.headers, naturalKey);
      if (k && seenKeys.has(k)) continue;
      const padded = headers.map((h) => {
        const idx = existing.headers.indexOf(h);
        return idx >= 0 ? r[idx] : '';
      });
      result.push(padded);
    }
    return { headers, rows: result };
  }
  // JSON AoO
  const existingArr = Array.isArray(existing) ? existing : [];
  const exMap = new Map();
  for (const r of existingArr) {
    const k = keyForRow(r, null, naturalKey);
    if (k) exMap.set(k, r);
  }
  const newAsObjs = rowsAsObjects(newCanonical.headers, newCanonical.rows);
  const seenKeys = new Set();
  const merged = [];
  for (const r of newAsObjs) {
    const k = keyForRow(r, null, naturalKey);
    merged.push(r);
    if (k) seenKeys.add(k);
  }
  for (const r of existingArr) {
    const k = keyForRow(r, null, naturalKey);
    if (k && seenKeys.has(k)) continue;
    merged.push(r);
  }
  return merged;
}

function mergeHeaderUnion(a, b) {
  const out = [...a];
  for (const h of b) if (!out.includes(h)) out.push(h);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Public: clearCache wrapper for routes
// ─────────────────────────────────────────────────────────────────

export function notifyCacheClear() {
  try {
    clearCache();
  } catch {
    /* no-op */
  }
}

// Re-export commonly used helpers so routes don't import 3 modules
export { getDataset, normKey };
