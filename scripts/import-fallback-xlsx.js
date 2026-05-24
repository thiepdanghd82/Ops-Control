#!/usr/bin/env node
/**
 * Re-imports operator-edited Fallback_Quote_Manual_*.xlsx +
 * Fallback_WorkOrder_Manual_*.xlsx into Ops Control after a
 * Rollback Runbook B incident.
 *
 * CLI:
 *   --dry-run               Parse + validate, no API calls
 *   --commit                Actually POST to API
 *   --quotes=<path|glob>    Path(s) to Fallback_Quote_Manual_*.xlsx
 *   --workorders=<path|glob> Path(s) to Fallback_WorkOrder_Manual_*.xlsx
 *   --api=<url>             API base (default OPS_BASE_URL or http://localhost:3000)
 *   --token=<value>         Session token (default OPS_SESSION_TOKEN env)
 *   --help                  Show CLI usage
 *
 * Env:
 *   OPS_FEATURE_PLANNING    '1' to enable WO import; default skips
 *   OPS_BASE_URL            API base fallback
 *   OPS_SESSION_TOKEN       Session token fallback
 *
 * Exit codes:
 *   0 = success (all rows processed; rejects are warnings)
 *   1 = fatal error (cannot read xlsx, cannot reach API, auth failure)
 *   2 = usage error (bad flags / missing required flag)
 *
 * Reference: docs/cutover/ROLLBACK-RUNBOOK-20260522.md §B.5
 */
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const QUOTE_REQUIRED = ['RFQ-ID', 'Customer', 'CCL_PN', 'MOQ', 'Quote Date', 'Sales-Rep'];
const WO_REQUIRED = [
  'WO-ID',
  'RFQ-ID',
  'Customer',
  'CCL_PN',
  'Qty Planned',
  'UOM',
  'Priority',
  'Due Date',
  'Status',
];
const WO_STATUS_ENUM = new Set([
  'CREATED',
  'RELEASED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'QC_RELEASED',
  'CLOSED',
  'CANCELLED',
]);
const EXAMPLE_NOTE_SENTINEL = 'EXAMPLE — DELETE BEFORE USE';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.substring(2)] = true;
    } else {
      out[arg.substring(2, eq)] = arg.substring(eq + 1);
    }
  }
  return out;
}

function printUsage() {
  process.stdout.write(`
Usage: node scripts/import-fallback-xlsx.js [options]

Options:
  --dry-run                 Parse + validate without API calls
  --commit                  Actually POST to API
  --quotes=<path|glob>      Path(s) to Fallback_Quote_Manual_*.xlsx
  --workorders=<path|glob>  Path(s) to Fallback_WorkOrder_Manual_*.xlsx
  --api=<url>               API base (default OPS_BASE_URL or http://localhost:3000)
  --token=<value>           Session token (default OPS_SESSION_TOKEN env)
  --help                    Show this help

Env:
  OPS_FEATURE_PLANNING      '1' to enable WO import; default skips
  OPS_BASE_URL              API base URL fallback
  OPS_SESSION_TOKEN         Session token fallback

Examples:
  # Dry-run a quote file
  node scripts/import-fallback-xlsx.js --dry-run --quotes=./tmp/Fallback_Quote_Manual_v1.0.xlsx

  # Commit + auth via env
  OPS_SESSION_TOKEN=<token> node scripts/import-fallback-xlsx.js \\
    --commit --quotes=./tmp/Fallback_Quote_Manual_*.xlsx

  # Multiple files via comma-separated
  --quotes=./a.xlsx,./b.xlsx
`);
}

function expandGlob(spec) {
  // Comma-separated list of paths. Glob expansion is left to the shell
  // (operators invoke from bash/PowerShell which expand * before we see it).
  return String(spec)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function readRows(file) {
  // Use fs.readFileSync + XLSX.read(buffer) — XLSX.readFile() chokes on
  // some path layouts (same workaround as build-fallback-templates.mjs).
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function isExampleRow(row) {
  return String(row.Notes || '').trim() === EXAMPLE_NOTE_SENTINEL;
}

function missingFields(row, required) {
  return required.filter((k) => String(row[k] ?? '').trim() === '');
}

async function processQuoteFile(file, opts, stats) {
  const basename = path.basename(file);
  let rows;
  try {
    rows = readRows(file);
  } catch (err) {
    console.error(`ERROR: cannot read ${file}: ${err.message}`);
    process.exit(1);
  }
  if (rows.length === 0) {
    console.log(`${basename}: no rows to import`);
    return;
  }
  console.log(`\n${basename}: ${rows.length} row(s) parsed`);
  let rowNum = 1; // 1-indexed for xlsx; +1 because row 1 is headers
  for (const row of rows) {
    rowNum += 1;
    if (isExampleRow(row)) {
      stats.skipped += 1;
      continue;
    }
    const missing = missingFields(row, QUOTE_REQUIRED);
    if (missing.length > 0) {
      stats.failed += 1;
      stats.rejects.push(`${basename}:${rowNum} quote missing: ${missing.join(',')}`);
      continue;
    }
    const body = {
      type: 'standard',
      label: `${row['RFQ-ID']} / ${row['CCL_PN']}`,
      state: {
        rfq_number: String(row['RFQ-ID']),
        ccl_pn: String(row['CCL_PN']),
        end_cu: String(row.Customer),
        moq: Number(row.MOQ),
        quote_date: String(row['Quote Date']),
        sale_owner: String(row['Sales-Rep']),
        notes: String(row.Notes || ''),
      },
      result: {},
    };
    if (opts.dryRun) {
      console.log(`  [dry-run] ${row['RFQ-ID']}: would POST /api/quotes`);
      stats.imported += 1;
      continue;
    }
    try {
      const res = await fetch(`${opts.apiBase}/api/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.token}`,
          'Idempotency-Key': `fallback-import-${basename}-${rowNum}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        stats.failed += 1;
        stats.rejects.push(`${basename}:${rowNum} HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }
      stats.imported += 1;
    } catch (err) {
      stats.failed += 1;
      stats.rejects.push(`${basename}:${rowNum} fetch error: ${err.message}`);
    }
  }
}

async function processWoFile(file, opts, stats) {
  const basename = path.basename(file);
  let rows;
  try {
    rows = readRows(file);
  } catch (err) {
    console.error(`ERROR: cannot read ${file}: ${err.message}`);
    process.exit(1);
  }
  if (rows.length === 0) {
    console.log(`${basename}: no rows to import`);
    return;
  }
  console.log(`\n${basename}: ${rows.length} row(s) parsed`);
  let rowNum = 1;
  for (const row of rows) {
    rowNum += 1;
    if (isExampleRow(row)) {
      stats.skipped += 1;
      continue;
    }
    const missing = missingFields(row, WO_REQUIRED);
    if (missing.length > 0) {
      stats.failed += 1;
      stats.rejects.push(`${basename}:${rowNum} WO missing: ${missing.join(',')}`);
      continue;
    }
    const status =
      String(row.Status || '')
        .trim()
        .toUpperCase() || 'CREATED';
    if (!WO_STATUS_ENUM.has(status)) {
      stats.failed += 1;
      stats.rejects.push(
        `${basename}:${rowNum} WO bad Status='${row.Status}' (must be one of ${[...WO_STATUS_ENUM].join('/')})`
      );
      continue;
    }
    const priority = Number(row.Priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 9) {
      stats.failed += 1;
      stats.rejects.push(
        `${basename}:${rowNum} WO bad Priority='${row.Priority}' (must be int 1-9)`
      );
      continue;
    }
    const body = {
      code: String(row['WO-ID']),
      rfq_no: String(row['RFQ-ID']),
      customer: String(row.Customer),
      ccl_pn: String(row['CCL_PN']),
      qty_planned: Number(row['Qty Planned']),
      uom: String(row.UOM),
      priority,
      due_date: String(row['Due Date']),
      status,
      notes: String(row.Notes || ''),
    };
    if (opts.dryRun) {
      console.log(`  [dry-run] ${row['WO-ID']}: would POST /api/planning/v2/work-orders`);
      stats.imported += 1;
      continue;
    }
    try {
      const res = await fetch(`${opts.apiBase}/api/planning/v2/work-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.token}`,
          'Idempotency-Key': `fallback-import-${basename}-${rowNum}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 404) {
        // v1.5.10 ships without Planning routes mounted; the script may run
        // against a server that doesn't have /api/planning/v2/work-orders.
        // Treat as graceful skip + record reason.
        stats.failed += 1;
        stats.rejects.push(
          `${basename}:${rowNum} HTTP 404: planning routes not mounted (set OPS_FEATURE_PLANNING=1 on server)`
        );
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        stats.failed += 1;
        stats.rejects.push(`${basename}:${rowNum} HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }
      stats.imported += 1;
    } catch (err) {
      stats.failed += 1;
      stats.rejects.push(`${basename}:${rowNum} fetch error: ${err.message}`);
    }
  }
}

function printSummary(stats) {
  console.log('\n═══ Import summary ═══');
  console.log(`Imported: ${stats.imported}`);
  console.log(`Skipped:  ${stats.skipped}`);
  console.log(`Failed:   ${stats.failed}`);
  if (stats.rejects.length > 0) {
    console.error(`\n${stats.rejects.length} reject(s):`);
    for (const r of stats.rejects) {
      console.error(`  ${r}`);
    }
  }
}

export async function runImport(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help) {
    printUsage();
    return 0;
  }

  const dryRun = args['dry-run'] === true;
  const commit = args.commit === true;
  if (!dryRun && !commit) {
    console.error('ERROR: must specify --dry-run or --commit');
    printUsage();
    return 2;
  }
  if (dryRun && commit) {
    console.error('ERROR: cannot use both --dry-run and --commit');
    return 2;
  }

  const apiBase = args.api || env.OPS_BASE_URL || 'http://localhost:3000';
  const token = args.token || env.OPS_SESSION_TOKEN || '';
  const planningEnabled = env.OPS_FEATURE_PLANNING === '1';
  const opts = { dryRun, commit, apiBase, token };
  const stats = { imported: 0, skipped: 0, failed: 0, rejects: [] };

  // Quotes
  if (args.quotes) {
    for (const file of expandGlob(args.quotes)) {
      await processQuoteFile(file, opts, stats);
    }
  }

  // Work orders
  if (args.workorders) {
    if (!planningEnabled) {
      console.log('\nNOTE: OPS_FEATURE_PLANNING=0 (default v1.5.10) — work orders skipped.');
      console.log('      Set OPS_FEATURE_PLANNING=1 to enable WO import.');
    } else {
      for (const file of expandGlob(args.workorders)) {
        await processWoFile(file, opts, stats);
      }
    }
  }

  if (!args.quotes && !args.workorders) {
    console.log('No files provided — use --quotes or --workorders. See --help.');
  }

  printSummary(stats);
  return 0;
}

// CLI entry point — only run when invoked directly, not when imported by tests.
// Check exact basename match (not endsWith) so the test file doesn't trigger
// runImport on import.
const isMain = path.basename(process.argv[1] || '') === 'import-fallback-xlsx.js';
if (isMain) {
  runImport()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('FATAL:', err.message);
      process.exit(1);
    });
}
