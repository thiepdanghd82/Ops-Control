#!/usr/bin/env node
/**
 * BL-4 helper — dump a quote's baseline numbers as a markdown table.
 *
 * Usage:
 *   node scripts/cutover/dump-baseline-numbers.mjs <quote_id> [--db <path>]
 *   node scripts/cutover/dump-baseline-numbers.mjs --list [--type std|cpx] [--db <path>]
 *
 * Defaults:
 *   --db = Mac DMG embedded server path:
 *          $HOME/Library/Application Support/ops-control-desktop/data/ops.db
 *   --db OPS_DATA_DIR/ops.db when OPS_DATA_DIR is set (standalone server)
 *
 * The template at docs/uat/smoke-quotes/2026-06-09-baseline.md expects
 * 11 fields per quote. Field-name mapping (template → result.<key>):
 *   GM%           → gm
 *   VA%           → va
 *   SP            → sp
 *   s_ttl         → s_ttl
 *   bd_mat_setup  → bd_mat_setup
 *   bd_mat_run    → bd_mat_run
 *   bd_ink_setup  → bd_ink_setup
 *   bd_ink_run    → bd_ink_run
 *   bd_proc_setup → bd_setup_mach + bd_setup_labor   (template alias)
 *   bd_proc_run   → bd_labor + bd_overhead           (template alias)
 *   bd_pack       → packing_ship
 *
 * Output is paste-ready markdown.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const has = (name) => argv.includes(name);

const dbArg = flag('--db');
const typeArg = flag('--type');
const dbPath =
  dbArg ||
  (process.env.OPS_DATA_DIR
    ? path.join(process.env.OPS_DATA_DIR, 'ops.db')
    : path.join(process.env.HOME, 'Library/Application Support/ops-control-desktop/data/ops.db'));

if (!existsSync(dbPath)) {
  console.error(`ERR: DB not found at ${dbPath}`);
  console.error('Set --db <path> or OPS_DATA_DIR env.');
  process.exit(2);
}

const Database = (await import(path.join(REPO, 'node_modules/better-sqlite3/lib/index.js')))
  .default;
const db = new Database(dbPath, { readonly: true });

function fmtN(v, digits = 6) {
  if (v == null || Number.isNaN(v)) return '—';
  return (
    Number(v)
      .toFixed(digits)
      .replace(/\.?0+$/, '') || '0'
  );
}
function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return (Number(v) * 100).toFixed(2) + '%';
}

if (has('--list')) {
  let sql =
    'SELECT id, type, rfq_number, ccl_pn, end_cu, saved_at as saved FROM quotes WHERE result IS NOT NULL';
  const params = [];
  if (typeArg === 'std') {
    sql += " AND type='standard'";
  } else if (typeArg === 'cpx') {
    sql += " AND type='complex'";
  }
  sql += ' ORDER BY saved_at DESC LIMIT 25';
  const rows = db.prepare(sql).all(...params);
  console.log(`Found ${rows.length} quotes${typeArg ? ` (type=${typeArg})` : ''}:\n`);
  console.log(
    '| ID  | Type     | RFQ              | CCL PN     | End Customer  | Saved (ISO UTC)          |'
  );
  console.log(
    '| --- | -------- | ---------------- | ---------- | ------------- | ------------------------ |'
  );
  for (const r of rows) {
    console.log(
      `| ${String(r.id).padEnd(3)} | ${r.type.padEnd(8)} | ${(r.rfq_number || '').padEnd(16)} | ${(r.ccl_pn || '').padEnd(10)} | ${(r.end_cu || '').padEnd(13)} | ${r.saved} |`
    );
  }
  process.exit(0);
}

const quoteId = argv[0] && !argv[0].startsWith('--') ? Number(argv[0]) : null;
if (!quoteId || Number.isNaN(quoteId)) {
  console.error('Usage: dump-baseline-numbers.mjs <quote_id> [--db <path>]');
  console.error('       dump-baseline-numbers.mjs --list [--type std|cpx]');
  process.exit(2);
}

const q = db
  .prepare(
    'SELECT id, type, rfq_number, ccl_pn, end_cu, version, saved_at as saved, result FROM quotes WHERE id = ?'
  )
  .get(quoteId);
if (!q) {
  console.error(`Quote id=${quoteId} not found.`);
  process.exit(1);
}
if (!q.result) {
  console.error(
    `Quote id=${quoteId} has no result (legacy thin schema). Open + save the quote in v1.5.10 first.`
  );
  process.exit(1);
}

const r = JSON.parse(q.result);

const bd_proc_setup = (r.bd_setup_mach || 0) + (r.bd_setup_labor || 0);
const bd_proc_run = (r.bd_labor || 0) + (r.bd_overhead || 0);
const bd_pack = r.packing_ship || 0;

const rows = [
  ['GM%', fmtPct(r.gm)],
  ['VA%', fmtPct(r.va)],
  ['SP (USD/unit)', fmtN(r.sp, 4)],
  ['s_ttl', fmtN(r.s_ttl)],
  ['bd_mat_setup', fmtN(r.bd_mat_setup)],
  ['bd_mat_run', fmtN(r.bd_mat_run)],
  ['bd_ink_setup', fmtN(r.bd_ink_setup)],
  ['bd_ink_run', fmtN(r.bd_ink_run)],
  ['bd_proc_setup', fmtN(bd_proc_setup) + (r.bd_setup_mach != null ? '' : ' *')],
  ['bd_proc_run', fmtN(bd_proc_run) + (r.bd_labor != null ? '' : ' *')],
  ['bd_pack', fmtN(bd_pack)],
];

console.log(`# Baseline dump — quote_id=${q.id}\n`);
console.log(`- **Type**:     ${q.type}`);
console.log(`- **RFQ**:      ${q.rfq_number || '—'}`);
console.log(`- **CCL PN**:   ${q.ccl_pn || '—'}`);
console.log(`- **End cu**:   ${q.end_cu || '—'}`);
console.log(`- **Version**:  ${q.version}`);
console.log(`- **Saved**:    ${q.saved}\n`);

console.log('## v1.5.10 actual outputs (paste into template)\n');
console.log('| Field         | v1.5.10 value |');
console.log('| ------------- | ------------- |');
for (const [k, v] of rows) {
  console.log(`| ${k.padEnd(13)} | ${String(v).padEnd(13)} |`);
}

if (rows.some(([, v]) => String(v).endsWith('*'))) {
  console.log('\n_* derived field — sums two `result.bd_*` keys per template alias._');
}

if (q.type === 'complex') {
  console.log('\n## Complex quote note\n');
  console.log('`result` is aggregate-only for complex; per-SP breakdown lives in `state_json`.');
  console.log(
    'Run again with `--state` flag (not yet implemented) when per-SP weights are needed.'
  );
}

db.close();
