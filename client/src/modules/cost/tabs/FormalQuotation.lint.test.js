/**
 * Guards the deliberate i18n split in FormalQuotation.jsx.
 *
 * The screen doubles as the printed customer document (window.print(),
 * and the print stylesheet hides only `.fq-toolbar`). Operator chrome is
 * translated; the document body is English on purpose so a locale switch
 * never changes what the customer receives. Both halves of that contract
 * are easy to break by "finishing" the translation, so assert them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsx = fs.readFileSync(path.join(here, 'FormalQuotation.jsx'), 'utf8');
const css = fs.readFileSync(path.join(here, 'FormalQuotation.css'), 'utf8');

test('operator chrome is translated', () => {
  for (const key of [
    'formal.title',
    'formal.released',
    'formal.new',
    'formal.print',
    'formal.release',
    'formal.save',
    'formal.saving',
    'formal.add_product',
    'formal.remove_product',
    'formal.toast.saved',
    'formal.toast.save_failed',
    'formal.toast.released',
    'formal.toast.reset',
    'formal.release.title',
    'formal.release.body',
    'formal.reset.title',
    'formal.reset.body',
    'formal.reset.confirm',
    'formal.cancel',
  ]) {
    assert.ok(jsx.includes(`t('${key}')`), `chrome string not translated: ${key}`);
  }
});

test('document copy stays English — never wrapped in t()', () => {
  // Card headers, field labels and product-table headers print verbatim.
  const documentCopy = [
    'Customer Information',
    'Quotation Details',
    'Products',
    'Terms &amp; Conditions',
    'Company',
    'Attention To',
    'Ref. No.',
    'Quotation Date',
    'Exchange Rate (VND/USD)',
    'Mat Draw',
    'Price USD',
    'Payment Terms',
    'Additional Terms',
  ];
  for (const s of documentCopy) {
    // Tolerate prettier wrapping the literal onto its own line.
    const re = new RegExp(`>\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`);
    assert.match(jsx, re, `document copy missing or restructured: ${s}`);
  }
  // The default terms are saved onto the quote and printed as-is.
  assert.ok(jsx.includes("'Prices are valid for 30 days from the date of this quotation.'"));
  assert.ok(
    !/t\(\s*'formal\.(terms|label|field|header)/.test(jsx),
    'document copy was moved into t()'
  );
});

test('translated edit controls are hidden from the printed document', () => {
  const printBlock = css.slice(css.indexOf('@media print'));
  for (const sel of ['.fq-toolbar', '.fq-add-btn', '.fq-del-btn']) {
    assert.ok(printBlock.includes(sel), `not print-hidden: ${sel}`);
  }
});
