/**
 * DecimalInput — pure-logic regression tests.
 *
 * The component itself requires a DOM to render, but the three pieces
 * that make the decimal-handling contract work are pure and testable
 * without JSDOM:
 *
 *   - DECIMAL_RE — the grammar that decides which keystrokes are
 *     accepted into the input. If this ever regresses, users will
 *     either get blocked mid-typing ("0." rejected) or be able to type
 *     junk ("1.2.3" accepted). Both are user-visible breakage.
 *
 *   - toDisplay(v) — the "show 0 as empty" policy. If this stops
 *     treating 0 as unset, uninitialized numeric fields render as
 *     a pre-filled "0" that silently becomes a real zero on save.
 *     Was a data-corruption risk in the pre-fix code.
 *
 *   - formatThousand(str) — thousand-separator rendering when the
 *     input is NOT focused. Edge cases with partial inputs ("", "-",
 *     ".", "-.") must pass through unchanged so mid-typing display
 *     doesn't blink.
 *
 * These tests lock the Sprint-Y fix (replacing ~50 <input type="number">
 * sites with DecimalInput) so the next refactor can't regress the
 * behavior silently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECIMAL_RE, toDisplay, toDisplayFixed, formatThousand, normalizeDecimalInput } from './DecimalInput.helpers.js';

// ── DECIMAL_RE: grammar of accepted inputs ──

test('DECIMAL_RE: accepts empty string (user cleared the field)', () => {
  assert.equal(DECIMAL_RE.test(''), true);
});

test('DECIMAL_RE: accepts partial inputs that are in-progress', () => {
  // These are what the user types on the way to a complete number.
  // If any of them is rejected, the keystroke gets dropped and the
  // user can't complete the value — the exact bug Sprint Y fixed.
  assert.equal(DECIMAL_RE.test('0'), true);
  assert.equal(DECIMAL_RE.test('0.'), true);   // "0." mid-typing
  assert.equal(DECIMAL_RE.test('.'), true);    // ".5" user started with dot
  assert.equal(DECIMAL_RE.test('.5'), true);
  assert.equal(DECIMAL_RE.test('-'), true);    // negative in-progress
  assert.equal(DECIMAL_RE.test('-0.'), true);
  assert.equal(DECIMAL_RE.test('-.5'), true);
});

test('DECIMAL_RE: accepts complete decimal numbers', () => {
  assert.equal(DECIMAL_RE.test('0.1'), true);
  assert.equal(DECIMAL_RE.test('12.345'), true);
  assert.equal(DECIMAL_RE.test('-3.14'), true);
  assert.equal(DECIMAL_RE.test('1000'), true);
});

test('DECIMAL_RE: rejects non-decimal garbage', () => {
  assert.equal(DECIMAL_RE.test('abc'), false);
  assert.equal(DECIMAL_RE.test('1.2.3'), false);  // double-dot
  assert.equal(DECIMAL_RE.test('1a'), false);
  assert.equal(DECIMAL_RE.test('--1'), false);    // double-minus
  assert.equal(DECIMAL_RE.test('1-2'), false);    // minus-in-middle
  assert.equal(DECIMAL_RE.test(' 1'), false);     // whitespace rejected
  assert.equal(DECIMAL_RE.test('1 '), false);
});

// ── toDisplay: numeric → display string ──

test('toDisplay: null and undefined → empty', () => {
  assert.equal(toDisplay(null), '');
  assert.equal(toDisplay(undefined), '');
});

test('toDisplay: empty string pass-through → empty', () => {
  assert.equal(toDisplay(''), '');
});

test('toDisplay: zero → empty (display-as-unset policy)', () => {
  // This is the invariant that unblocks the "value={x || ''}" bug —
  // callers can now simply pass `value={x}` and trust the component
  // to hide zeros. Regressing this means uninitialized fields render
  // "0" by default, which then saves as a real 0.
  assert.equal(toDisplay(0), '');
  assert.equal(toDisplay(0.0), '');
  assert.equal(toDisplay(-0), '');
});

test('toDisplay: NaN → empty', () => {
  assert.equal(toDisplay(NaN), '');
});

test('toDisplay: non-zero numbers → string', () => {
  assert.equal(toDisplay(1), '1');
  assert.equal(toDisplay(0.1), '0.1');
  assert.equal(toDisplay(-3.14), '-3.14');
  assert.equal(toDisplay(1000), '1000');
});

// ── formatThousand: idle-display thousand separator ──

test('formatThousand: partial inputs pass through unchanged', () => {
  // Mid-typing values must NOT be rewritten or the input flickers.
  assert.equal(formatThousand(''), '');
  assert.equal(formatThousand('-'), '-');
  assert.equal(formatThousand('.'), '.');
  assert.equal(formatThousand('-.'), '-.');
});

test('formatThousand: null / undefined pass through', () => {
  assert.equal(formatThousand(null), null);
  assert.equal(formatThousand(undefined), undefined);
});

test('formatThousand: integer gets comma grouping', () => {
  assert.equal(formatThousand('1000'), '1,000');
  assert.equal(formatThousand('1000000'), '1,000,000');
  assert.equal(formatThousand('999'), '999');        // under 1k unchanged
});

test('formatThousand: decimal part preserved verbatim', () => {
  // Decimal part is never grouped; only the integer part is.
  assert.equal(formatThousand('1000.5'), '1,000.5');
  assert.equal(formatThousand('1234567.89'), '1,234,567.89');
});

test('formatThousand: negative numbers keep their sign', () => {
  assert.equal(formatThousand('-1000'), '-1,000');
  assert.equal(formatThousand('-1234.56'), '-1,234.56');
});

test('formatThousand: accepts comma-as-decimal input (vi-VN)', () => {
  // User typed with a comma (Vietnamese/European keyboard). Normalize
  // to dot + group properly, so the idle display still makes sense.
  assert.equal(formatThousand('1000,5'), '1,000.5');
});

test('formatThousand: unparseable garbage passes through', () => {
  // Defensive: if someone feeds non-numeric, return as-is rather than
  // throwing. The caller is always the component's own state so this
  // is a defense against future bugs.
  assert.equal(formatThousand('abc'), 'abc');
});

// ── normalizeDecimalInput — paste-preprocessing contract ───────────
// Added after the MAT PRICE paste bug: users copying values from Excel
// or Google Sheets would paste with trailing \r\n (Excel line-ending)
// and the whole input got silently rejected by DECIMAL_RE.

test('normalizeDecimalInput: strips trailing newline from Excel paste', () => {
  // Excel cell-copy appends \r\n on macOS and \n on Linux. Before the
  // fix these would fail DECIMAL_RE and the paste looked broken.
  assert.equal(normalizeDecimalInput('0.1352\r\n'), '0.1352');
  assert.equal(normalizeDecimalInput('0.1352\n'), '0.1352');
  assert.equal(normalizeDecimalInput('42\t'), '42');
  assert.equal(normalizeDecimalInput('  -3.14  '), '-3.14');
});

test('normalizeDecimalInput: US thousand separator + dot decimal — strip commas', () => {
  assert.equal(normalizeDecimalInput('1,234.56'), '1234.56');
  assert.equal(normalizeDecimalInput('1,234,567.89'), '1234567.89');
});

test('normalizeDecimalInput: Euro/VN decimal comma (single, no dot) → to dot', () => {
  // A single comma with no dot is the Vietnamese/European decimal
  // separator — convert to "." so DECIMAL_RE accepts it.
  assert.equal(normalizeDecimalInput('0,1352'), '0.1352');
  assert.equal(normalizeDecimalInput('12,5'), '12.5');
  assert.equal(normalizeDecimalInput('-3,14'), '-3.14');
});

test('normalizeDecimalInput: thousandSep mode strips ALL commas unconditionally', () => {
  // When the component is in thousandSep display mode the commas are
  // formatter output; we always strip on re-entry.
  assert.equal(normalizeDecimalInput('1,234.56', true), '1234.56');
  assert.equal(normalizeDecimalInput('1,234', true), '1234');
  assert.equal(normalizeDecimalInput('0,5', true), '05'); // ambiguous with sep mode — commas stripped
});

test('normalizeDecimalInput: already-clean input passes through', () => {
  assert.equal(normalizeDecimalInput('0.1'), '0.1');
  assert.equal(normalizeDecimalInput('42'), '42');
  assert.equal(normalizeDecimalInput(''), '');
});

test('normalizeDecimalInput: null / undefined safe', () => {
  assert.equal(normalizeDecimalInput(null), '');
  assert.equal(normalizeDecimalInput(undefined), '');
});

test('normalizeDecimalInput: garbage strings still fail DECIMAL_RE downstream', () => {
  // We normalize separators but do NOT attempt to clean alpha characters;
  // DECIMAL_RE rejects those downstream. Just verify we don't accidentally
  // sanitize them here.
  assert.equal(normalizeDecimalInput('abc'), 'abc');
  assert.equal(normalizeDecimalInput('1.2.3'), '1.2.3');
  assert.equal(DECIMAL_RE.test(normalizeDecimalInput('abc')), false);
});

test('normalizeDecimalInput: paste flow end-to-end — all cases reach valid regex', () => {
  // The full contract: anything a real user would paste from Excel,
  // Google Sheets, or a VN-locale calculator should normalize to a
  // string that passes DECIMAL_RE.
  const pastes = ['0.1352\r\n', '1,234.56', '0,1352', '  42  ', '-3,14', '1.5'];
  for (const p of pastes) {
    const norm = normalizeDecimalInput(p);
    assert.equal(DECIMAL_RE.test(norm), true, `DECIMAL_RE should accept normalized form of "${p}" → "${norm}"`);
  }
});

// Sprint 14n-4 — fixed-decimals display for engineering precision
// fields (Min Gap MD, etc.) where operators rely on seeing 3 decimal
// places consistently rather than JS's default trailing-zero strip.
test('toDisplayFixed: pads short decimals up to the budget', () => {
  assert.equal(toDisplayFixed(7.2, 3),    '7.200');
  assert.equal(toDisplayFixed(7,   3),    '7.000');
  assert.equal(toDisplayFixed(7.225, 3),  '7.225');
});

test('toDisplayFixed: rounds longer decimals to the budget (display-only)', () => {
  assert.equal(toDisplayFixed(7.2255, 3), '7.226');
  assert.equal(toDisplayFixed(7.2254, 3), '7.225');
});

test('toDisplayFixed: respects toDisplay zero-as-empty', () => {
  assert.equal(toDisplayFixed(0,   3), '');
  assert.equal(toDisplayFixed(null, 3), '');
  assert.equal(toDisplayFixed(undefined, 3), '');
  assert.equal(toDisplayFixed(NaN, 3), '');
});

test('toDisplayFixed: undefined decimals falls back to toDisplay', () => {
  assert.equal(toDisplayFixed(7.2, undefined), '7.2');
  assert.equal(toDisplayFixed(7.2, null), '7.2');
  assert.equal(toDisplayFixed(7.2, -1), '7.2');
});
