/**
 * DecimalInput — a locale-safe decimal text input.
 *
 * Why this exists:
 *   <input type="number"> has two well-known bugs with React controlled
 *   components in this codebase:
 *     1. In vi-VN locale some browsers reject "." as a decimal separator
 *        and silently discard decimal digits, so "0.2342" becomes "0".
 *     2. The idiom `value={state || ''}` clobbers legit zero values (the
 *        literal `0` is falsy) — typing "0" shows an empty field.
 *     3. `parseFloat(e.target.value) || 0` can't distinguish "empty field"
 *        from "explicit zero" and blocks partial inputs like "0.".
 *
 * This component stores the raw STRING locally during typing and only
 * commits a parsed number to the parent when the string represents a
 * complete valid number. Partial inputs ("", "-", "0.", ".5") are kept
 * visible without triggering upstream recalcs or clobbering the dot.
 *
 * Accepts both "." and "," as decimal separator (the "," is normalized
 * to "." before parsing) so users with European/Vietnamese keyboards
 * type naturally.
 */

import { useCallback, useEffect, useState } from 'react';
// Pure helpers live in a sibling .js file so node --test can load them
// without a JSX transform. Import-only here (no re-export) because
// Vite Fast Refresh requires component files to export only components.
// Callers should import helpers directly from './DecimalInput.helpers.js'.
// eslint-disable-next-line no-unused-vars -- toDisplay re-exported for callers, see note above
import {
  DECIMAL_RE,
  toDisplay,
  toDisplayFixed,
  formatThousand,
  normalizeDecimalInput,
} from './DecimalInput.helpers.js';

export default function DecimalInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  title,
  onBlur,
  onFocus,
  style,
  thousandSep = false,
  // When set, the IDLE (un-focused) display pads to this many decimal
  // places — e.g. `decimals={3}` shows 7.2 as "7.200". The underlying
  // value passed to onChange is never rounded, so cross-tab sync /
  // calc round-trips preserve precision (CLAUDE.md lesson 17).
  decimals,
  ...rest
}) {
  // Local mirror of the input string so partial values ("0.", ".", "-")
  // don't get wiped by the parent's re-render.
  const [local, setLocal] = useState(() => toDisplayFixed(value, decimals));
  const [focused, setFocused] = useState(false);

  // When the parent pushes a new value from outside (eg. programmatic
  // reset, loading a saved quote), re-sync — but skip if the user is
  // mid-typing a value that parses to the same number (eg. showing
  // "0.20" while parent has 0.2).
  useEffect(() => {
    const parsedLocal = parseFloat(local.replace(',', '.'));
    const external = value == null ? NaN : Number(value);
    if (parsedLocal !== external && !(Number.isNaN(parsedLocal) && Number.isNaN(external))) {
      setLocal(toDisplayFixed(value, decimals));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = useCallback(
    (e) => {
      // normalizeDecimalInput handles: whitespace trim (Excel/Sheets paste),
      // thousand-separator stripping, Euro/VN comma-as-decimal conversion.
      const norm = normalizeDecimalInput(e.target.value, thousandSep);
      if (!DECIMAL_RE.test(norm)) return; // reject non-decimal chars silently
      setLocal(norm);
      if (norm === '' || norm === '-' || norm === '.' || norm === '-.') {
        // Partial — don't push a number upstream yet. Callers decide how
        // to treat the cleared state on blur.
        return;
      }
      const n = parseFloat(norm);
      if (!Number.isNaN(n)) onChange(n);
    },
    [onChange, thousandSep]
  );

  const handleFocus = useCallback(
    (e) => {
      setFocused(true);
      if (onFocus) onFocus(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e) => {
      // On blur, if the string doesn't parse (empty, dangling "."), push
      // 0 upstream and normalize the display.
      const norm = local.replace(',', '.');
      const n = parseFloat(norm);
      if (Number.isNaN(n)) {
        onChange(0);
        setLocal('');
      } else {
        // Pad to the caller's decimal budget for the idle display, but
        // pass the un-rounded number upstream so precision is preserved.
        setLocal(toDisplayFixed(n, decimals));
      }
      setFocused(false);
      if (onBlur) onBlur(e);
    },
    [local, onChange, onBlur, decimals]
  );

  const displayValue = thousandSep && !focused ? formatThousand(local) : local;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      style={style}
      {...rest}
    />
  );
}
