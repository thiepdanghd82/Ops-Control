#!/usr/bin/env node
/**
 * Parity verifier: loads every dataset from BOTH backends (file + sqlite)
 * and compares row count + SHA256 of sorted-rows JSON.
 *
 * Exits 0 on full parity, 2 on any mismatch. Prints per-dataset delta
 * so operators can see where drift happened.
 *
 * Usage:
 *   node scripts/verify-parity.js
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadBackend(name) {
  process.env.OPS_DATA_BACKEND = name;
  // Dynamic import so each call re-evaluates with the new env var.
  // Cache-bust via query string (ES modules).
  const mod = await import(`../server/repositories/index.js?t=${Date.now()}_${name}`);
  return mod;
}

function checksum(rows) {
  const h = crypto.createHash('sha256');
  const sorted = rows.map(r => JSON.stringify(r)).sort();
  for (const s of sorted) h.update(s).update('\n');
  return h.digest('hex');
}

async function main() {
  const file = await loadBackend('file');
  const sqlite = await loadBackend('sqlite');

  const datasets = [
    ['bom', 'listBom'],
    ['routing', 'listRouting'],
    ['inventory', 'listInventory'],
    ['finishedGoods', 'listFinishedGoods'],
    ['rawMaterials', 'listRawMaterials'],
    ['materialsNpi', 'listMaterialsNpi'],
    ['materialsSourcing', 'listMaterialsSourcing'],
    // Sprint 7.1 shadow-write target. Until /save-all has run at
    // least once post-deploy the SQLite side may lag the file side;
    // operators should run verify-parity AFTER a /save-all cycle.
    ['quotes', 'listQuotes'],
  ];

  let fail = 0;
  console.log('Dataset             File rows   DB rows     File cksum       DB cksum         Match');
  console.log('─────────────────── ─────────── ─────────── ──────────────── ──────────────── ─────');
  for (const [name, fn] of datasets) {
    const fRows = file[fn]();
    const sRows = sqlite[fn]();
    const fc = checksum(fRows);
    const sc = checksum(sRows);
    const match = fRows.length === sRows.length && fc === sc;
    if (!match) fail++;
    console.log(
      name.padEnd(20),
      String(fRows.length).padStart(10),
      String(sRows.length).padStart(11),
      fc.slice(0, 16),
      sc.slice(0, 16),
      match ? '  ✓' : '  ✖'
    );
  }
  console.log('');
  if (fail > 0) {
    console.error(`${fail} dataset(s) failed parity check.`);
    process.exit(2);
  }
  console.log('All datasets parity-match.');
}

main().catch(err => {
  console.error('Parity check crashed:', err);
  process.exit(3);
});
