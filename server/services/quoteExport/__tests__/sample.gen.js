#!/usr/bin/env node
// @ts-check
/**
 * Sample xlsx generator — picks the latest quote from the dev
 * quote_history.json and produces both customer + internal variants
 * (single tier) into the repo's `4. CLAUDE OUTPUT/` dir for manual
 * inspection.
 *
 * Usage:
 *   node server/services/quoteExport/__tests__/sample.gen.js
 *
 * NOT run as part of `npm test` — manual deliverable per task spec.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportQuote } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const HISTORY = path.join(ROOT, 'server/data/Library/QuoteHistory/quote_history.json');
const OUT_DIR = path.resolve(ROOT, '../../4. CLAUDE OUTPUT');

async function main() {
  const all = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  // Pick the most recent quote that has a non-empty `result` snapshot.
  const eligible = all.filter((q) => q && q.result && q.state).reverse();
  if (eligible.length === 0) {
    console.error('No quote with result snapshot found in', HISTORY);
    process.exit(1);
  }
  const quote = eligible[0];
  console.log(`Using quote id=${quote.id} label=${quote.label} type=${quote.type}`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const variant of ['customer', 'internal']) {
    const out = await exportQuote(quote, {
      variant,
      lang: 'bilingual',
      tiers: 'all',
      exportedBy: 'sample-gen',
    });
    if (out.kind !== 'xlsx') {
      console.log(`Quote has ${out.kind} — would be ${out.filename}, len=${out.buffer.length}`);
      const p = path.join(OUT_DIR, out.filename);
      fs.writeFileSync(p, out.buffer);
      console.log(`Wrote ${p} (${out.buffer.length} bytes)`);
      continue;
    }
    const p = path.join(OUT_DIR, out.filename);
    fs.writeFileSync(p, out.buffer);
    console.log(`Wrote ${p} (${out.buffer.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
