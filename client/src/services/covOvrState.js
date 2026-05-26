/**
 * COV OVR cell state helper — shared between StandardCalc/CalcInks.jsx
 * and ComplexCalc/SubProductRow.jsx so the 3-state UI stays in lock-step.
 *
 * Inputs:
 *   - override      Number | null | undefined — the persisted `ink.coverage_override`
 *   - printType     String — currently selected print_type
 *   - covLookup     Map<string, number> — built from `lib.ddl.coverage` (pt → cov)
 *   - isIndigo      Boolean — `isIndigoPrintType(printType)` from printTypeUtils
 *
 * Returns one of four states:
 *   - 'indigo'   print_type is an Indigo subtype → cell disabled (click-charges instead)
 *   - 'manual'   override has a positive value → calcInk uses override; show violet + Reset
 *   - 'auto'     no override + Coverage Table has a value → calcInk uses auto; show italic gray
 *   - 'empty'    no override + Coverage Table has no value (e.g. LP) → show `—`, user must type
 *
 * `displayPlaceholder` is what to put on the `<input placeholder=…>` (empty when manual
 * because the value field is the source of truth then). `showReset` flips to `true` only
 * in 'manual' state so the icon doesn't clutter the auto cells.
 */

export const MANUAL_OVERRIDE_COLOR = '#7c3aed'; // violet-600
export const AUTO_PLACEHOLDER_COLOR = '#9ca3af'; // gray-400
export const EMPTY_PLACEHOLDER = '—'; // em dash

export function getCovOvrState({ override, printType, covLookup, isIndigo }) {
  if (isIndigo) {
    return {
      state: 'indigo',
      autoValue: null,
      displayPlaceholder: '',
      showReset: false,
    };
  }

  const overrideNum = Number(override);
  const hasManual = Number.isFinite(overrideNum) && overrideNum > 0;
  if (hasManual) {
    return {
      state: 'manual',
      autoValue: covLookup?.get?.(printType) ?? null,
      displayPlaceholder: '',
      showReset: true,
    };
  }

  const auto = covLookup?.get?.(printType);
  if (auto != null && auto !== '' && Number.isFinite(Number(auto))) {
    return {
      state: 'auto',
      autoValue: Number(auto),
      displayPlaceholder: String(auto),
      showReset: false,
    };
  }

  return {
    state: 'empty',
    autoValue: null,
    displayPlaceholder: EMPTY_PLACEHOLDER,
    showReset: false,
  };
}

/**
 * Tooltip text for the COV OVR cell — mirrors what calcInk will consume.
 * Kept here so both calculators show identical hover copy.
 */
export function getCovOvrTooltip({ state, autoValue }) {
  switch (state) {
    case 'indigo':
      return 'Indigo uses click-charges, not coverage';
    case 'manual':
      return autoValue != null
        ? `Manual override. Auto would be ${autoValue} from Coverage Table. Click ↻ to reset.`
        : 'Manual override. Click ↻ to reset.';
    case 'auto':
      return `Auto-synced from Coverage Table (${autoValue}). Type to override.`;
    case 'empty':
    default:
      return 'No Coverage Table entry for this Print Type. Type a value to use.';
  }
}
