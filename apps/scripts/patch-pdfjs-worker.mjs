/**
 * patch-pdfjs-worker.mjs — prepends a polyfill to pdfjs-dist's worker file
 * so it runs BEFORE any PDF.js code in the worker's realm.
 *
 * Why: Chromium 130+ (Electron 33's runtime) ships native
 * `Uint8Array.prototype.toHex` / `toBase64`. PDF.js v4's guarded check
 * `Uint8Array.prototype.toHex ? e.toHex() : <fallback>` then calls
 * `e.toHex()` unconditionally — which crashes when `e` is a plain Array
 * (some PDFs hand the trailer /ID parser one). Forcing the slow path by
 * deleting those prototype methods sidesteps the engine bug.
 *
 * The worker runs in its own realm, so main-thread `delete` doesn't reach
 * it. Patching the worker file at build time is the most reliable fix.
 *
 * Idempotent: detects the marker comment and skips re-patching.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targets = [
  path.resolve(__dirname, '../client/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  path.resolve(__dirname, '../client/node_modules/pdfjs-dist/build/pdf.worker.mjs'),
];

const MARKER = '/* OC_PATCHED_TOHEX */';
const SHIM = `${MARKER}try{delete Uint8Array.prototype.toHex}catch(e){}try{delete Uint8Array.prototype.toBase64}catch(e){}\n`;

let patched = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, 'utf8');
  if (original.startsWith(MARKER)) {
    console.log(`✓ already patched: ${path.relative(process.cwd(), file)}`);
    continue;
  }
  fs.writeFileSync(file, SHIM + original);
  console.log(`✓ patched: ${path.relative(process.cwd(), file)}`);
  patched++;
}
if (patched === 0 && targets.every((f) => !fs.existsSync(f))) {
  console.warn('⚠ no pdfjs-dist worker files found — was npm install run?');
  process.exit(1);
}
