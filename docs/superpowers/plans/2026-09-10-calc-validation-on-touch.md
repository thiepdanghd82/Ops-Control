# Calculator Validation On Touch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a brand-new calculator record from opening with 7 errors, and connect each error to the field that caused it.

**Architecture:** `calcValidation.js` is already a pure function returning `{id, severity, scope, message}` objects with stable ids. Two additions keep it pure: a `field` key on each warning that maps to a form field, and a `gateWarnings()` filter that hides a field's warning until the user has touched that field or attempted a save. `RfqInfoCard.jsx` — shared by BOTH the Standard and Complex windows — then marks required fields and wires `aria-invalid` / `aria-describedby` from the warning for that field. `WarningBar.jsx` renders gated warnings instead of raw ones.

**Tech Stack:** React 19, `node:test` + `node:assert/strict`, ESM.

**Spec:** UI/UX audit findings, 2026-09-10 (this session). Measured on a freshly opened Standard Calc window: `7 errors + 1 warning` shown, `totalFields: 25`, `filledFields: 4` (defaults only), `requiredMarked: 0`, `fieldsWithAriaInvalid: 0`, `fieldsWithAriaDescribedby: 0`.

## Global Constraints

- **Validators must stay pure.** `calcValidation.js` header says: _"the validators NEVER mutate state; they only read it."_ Every function added here reads and returns; none mutate.
- **Warning `id`s are stable and are React keys.** Do not rename existing ids (`hdr-ccl-pn`, `hdr-moq`, `hdr-moq-neg`, `hdr-eau`, `hdr-eau-neg`). Later tasks join on them.
- **`RfqInfoCard.jsx` is shared by Standard and Complex.** A change there lands in both windows. Do not fork it.
- **Save must still be blocked by errors.** Gating changes what is _displayed_, never what `severity: 'error'` means. `validateStandard` / `validateComplex` return values are unchanged in content.
- Test style follows `services/calcValidation.test.js`: `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, fixture helper functions, no test framework beyond node's.
- Run the client suite with: `cd client && node --test 'src/**/*.test.js'` (1785 tests green as of this plan).

---

### Task 1: Tag header warnings with the field that caused them

**Files:**

- Modify: `client/src/services/calcValidation.js:59-95` (`validateHeader`)
- Test: `client/src/services/calcValidation.test.js`

**Interfaces:**

- Consumes: nothing.
- Produces: every warning object emitted by `validateHeader` gains a `field` key — a string matching the key used in calc state (`'ccl_pn'`, `'moq'`, `'annual_qty'`). Warnings that do not correspond to a single field omit the key (it is `undefined`). Task 2 and Task 4 both join on `warning.field`.

- [ ] **Step 1: Write the failing test**

Append to `client/src/services/calcValidation.test.js`:

```js
test('header warnings carry the field key that caused them', () => {
  const out = validateStandard(baseStd({ ccl_pn: '', moq: 0, annual_qty: 0 }));

  const byId = Object.fromEntries(out.map((w) => [w.id, w]));
  assert.equal(byId['hdr-ccl-pn'].field, 'ccl_pn');
  assert.equal(byId['hdr-moq'].field, 'moq');
  assert.equal(byId['hdr-eau'].field, 'annual_qty');
});

test('negative-value header warnings carry the same field key', () => {
  const out = validateStandard(baseStd({ moq: -5, annual_qty: -1 }));

  const byId = Object.fromEntries(out.map((w) => [w.id, w]));
  assert.equal(byId['hdr-moq-neg'].field, 'moq');
  assert.equal(byId['hdr-eau-neg'].field, 'annual_qty');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/services/calcValidation.test.js`
Expected: FAIL — `Expected values to be strictly equal: undefined !== 'ccl_pn'`

- [ ] **Step 3: Add the field key**

In `client/src/services/calcValidation.js`, add a `field` property to each object pushed in `validateHeader`:

```js
function validateHeader(st, scopeLabel = 'Header') {
  const out = [];
  if (isBlank(st.ccl_pn)) {
    out.push({
      id: 'hdr-ccl-pn',
      severity: 'error',
      scope: scopeLabel,
      field: 'ccl_pn',
      message: 'CCL Part Number is required',
    });
  }
  if (num(st.moq) < 0) {
    out.push({
      id: 'hdr-moq-neg',
      severity: 'error',
      scope: scopeLabel,
      field: 'moq',
      message: 'MOQ is negative — must be a positive number',
    });
  } else if (num(st.moq) <= 0) {
    out.push({
      id: 'hdr-moq',
      severity: 'error',
      scope: scopeLabel,
      field: 'moq',
      message: 'MOQ must be greater than 0 (MOQ = 0 inflates Setup/Tooling)',
    });
  }
  if (num(st.annual_qty) < 0) {
    out.push({
      id: 'hdr-eau-neg',
      severity: 'error',
      scope: scopeLabel,
      field: 'annual_qty',
      message: 'Annual Qty (EAU) is negative — must be a positive number',
    });
  } else if (num(st.annual_qty) <= 0) {
    out.push({
      id: 'hdr-eau',
      severity: 'error',
      scope: scopeLabel,
      field: 'annual_qty',
      message: 'Annual Qty (EAU) must be greater than 0',
    });
  }
  return out;
}
```

Keep the rest of `validateHeader` below this block exactly as it is. Do not change any `message` string — the existing 14 tests assert on them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && node --test src/services/calcValidation.test.js`
Expected: PASS, including all 14 pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/calcValidation.js client/src/services/calcValidation.test.js
git commit -m "$(cat <<'EOF'
feat(apps/client): tag header validation warnings with their source field

Each warning already had a stable id; adding the calc-state key that
produced it lets the form join a warning back to its input for
aria-invalid / aria-describedby, and lets gating hide a warning until
that specific field is touched. Pure addition — no message or id
changes, so existing assertions are untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add the pure gate that hides untouched-field warnings

**Files:**

- Modify: `client/src/services/calcValidation.js` (add export at end of file)
- Test: `client/src/services/calcValidation.test.js`

**Interfaces:**

- Consumes: warning objects with the `field` key from Task 1.
- Produces: `export function gateWarnings(warnings, { touched = [], saveAttempted = false } = {})` → returns a filtered array of the same warning objects. Task 5 calls it from `WarningBar.jsx`.

Gate rules:

1. `saveAttempted === true` → return everything. Pressing Save means "tell me everything that is wrong".
2. A warning with no `field` → always shown. It describes the record as a whole, not an input the user can touch.
3. A warning whose `field` is in `touched` → shown.
4. Otherwise → hidden.

- [ ] **Step 1: Write the failing test**

Append to `client/src/services/calcValidation.test.js`:

```js
import { gateWarnings } from './calcValidation.js';

const W = {
  cclPn: { id: 'hdr-ccl-pn', severity: 'error', scope: 'Header', field: 'ccl_pn', message: 'x' },
  moq: { id: 'hdr-moq', severity: 'error', scope: 'Header', field: 'moq', message: 'y' },
  noField: { id: 'gen-1', severity: 'warn', scope: 'Pricing', message: 'z' },
};

test('a fresh record with nothing touched shows no field warnings', () => {
  const out = gateWarnings([W.cclPn, W.moq], { touched: [], saveAttempted: false });
  assert.deepEqual(out, []);
});

test('touching one field reveals only that field warning', () => {
  const out = gateWarnings([W.cclPn, W.moq], { touched: ['ccl_pn'], saveAttempted: false });
  assert.deepEqual(
    out.map((w) => w.id),
    ['hdr-ccl-pn']
  );
});

test('attempting save reveals every warning regardless of touch', () => {
  const out = gateWarnings([W.cclPn, W.moq], { touched: [], saveAttempted: true });
  assert.equal(out.length, 2);
});

test('record-level warnings with no field are always shown', () => {
  const out = gateWarnings([W.cclPn, W.noField], { touched: [], saveAttempted: false });
  assert.deepEqual(
    out.map((w) => w.id),
    ['gen-1']
  );
});

test('gateWarnings does not mutate its input', () => {
  const input = [W.cclPn, W.moq];
  const copy = JSON.parse(JSON.stringify(input));
  gateWarnings(input, { touched: ['moq'], saveAttempted: false });
  assert.deepEqual(input, copy);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/services/calcValidation.test.js`
Expected: FAIL — `gateWarnings is not a function` (or an import error naming `gateWarnings`).

- [ ] **Step 3: Write the minimal implementation**

Append to `client/src/services/calcValidation.js`:

```js
/**
 * Filter validation output down to what the operator should see right now.
 *
 * A freshly opened record is empty by definition, so running the raw
 * validators against it produces a wall of "X is required" before the
 * user has typed anything. That trained people to ignore the bar. Gate
 * it: a field's warning appears once that field has been touched, or
 * once Save has been pressed and the operator has asked for the full list.
 *
 * Pure — returns a new array, never mutates `warnings`.
 */
export function gateWarnings(warnings, { touched = [], saveAttempted = false } = {}) {
  if (saveAttempted) return warnings.slice();
  const seen = new Set(touched);
  return warnings.filter((w) => !w.field || seen.has(w.field));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && node --test src/services/calcValidation.test.js`
Expected: PASS, all tests including the 14 pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/calcValidation.js client/src/services/calcValidation.test.js
git commit -m "$(cat <<'EOF'
feat(apps/client): add gateWarnings() to hide untouched-field warnings

A new record is empty by definition, so the raw validators fire on open
and the operator meets 7 errors before typing anything. gateWarnings()
filters to fields the user has actually touched, plus everything once
Save is pressed. Record-level warnings with no field always show.

Pure and separately tested; it changes what is displayed, never what
severity:'error' means, so Save stays blocked by real errors.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Track touched fields and save attempts in CalcContext

**Files:**

- Modify: `client/src/context/CalcContext.jsx` (add state, add to the memoised `value` object and its dep array, around lines 150–200)
- Test: `client/src/context/CalcContext.touched.test.js` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: `useCalc()` additionally returns:
  - `touched: string[]` — field keys the operator has edited or blurred
  - `markTouched(field: string): void` — idempotent; adding an existing field is a no-op
  - `saveAttempted: boolean`
  - `markSaveAttempted(): void`
  - `resetTouched(): void` — called when a record is loaded or reset, so a freshly opened record starts clean

  Tasks 4 and 5 consume all five.

- [ ] **Step 1: Write the failing test**

Create `client/src/context/CalcContext.touched.test.js`. This tests the touched-set reducer logic in isolation — no React renderer is available in this suite, so the plan extracts the logic into a pure helper that the provider then uses.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTouched } from './touchedState.js';

test('adding a field records it', () => {
  assert.deepEqual(addTouched([], 'ccl_pn'), ['ccl_pn']);
});

test('adding the same field twice returns the identical array reference', () => {
  const before = ['ccl_pn'];
  const after = addTouched(before, 'ccl_pn');
  assert.equal(after, before, 'must return the same reference so React skips the re-render');
});

test('adding a second field appends without dropping the first', () => {
  assert.deepEqual(addTouched(['ccl_pn'], 'moq'), ['ccl_pn', 'moq']);
});

test('blank or missing field names are ignored', () => {
  const before = ['ccl_pn'];
  assert.equal(addTouched(before, ''), before);
  assert.equal(addTouched(before, undefined), before);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/context/CalcContext.touched.test.js`
Expected: FAIL — cannot find module `./touchedState.js`.

- [ ] **Step 3: Write the pure helper**

Create `client/src/context/touchedState.js`:

```js
/**
 * touchedState — pure helpers for the "which fields has the operator
 * actually edited" set held by CalcContext.
 *
 * Kept out of the provider so it can be unit-tested without a React
 * renderer, and so the identity guarantee below is pinned by a test:
 * re-adding an existing field returns the SAME array reference, which
 * is what stops every keystroke from re-rendering the whole calculator.
 */

export function addTouched(touched, field) {
  if (!field) return touched;
  if (touched.includes(field)) return touched;
  return [...touched, field];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && node --test src/context/CalcContext.touched.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the helper into the provider**

In `client/src/context/CalcContext.jsx`:

Add the import at the top, next to the other local imports:

```js
import { addTouched } from './touchedState.js';
```

Add state alongside the existing `useState` declarations in the provider body:

```js
const [touched, setTouched] = useState([]);
const [saveAttempted, setSaveAttempted] = useState(false);
```

Add the three callbacks next to the existing `useCallback` definitions (`markClean`, `resetStd`, …):

```js
const markTouched = useCallback((field) => {
  setTouched((prev) => addTouched(prev, field));
}, []);

const markSaveAttempted = useCallback(() => {
  setSaveAttempted(true);
}, []);

const resetTouched = useCallback(() => {
  setTouched([]);
  setSaveAttempted(false);
}, []);
```

Add the five new entries to the memoised `value` object and to its dependency array (the array that currently ends `canUndo, canRedo`):

```js
      canUndo,
      canRedo,
      touched,
      markTouched,
      saveAttempted,
      markSaveAttempted,
      resetTouched,
```

Then call `resetTouched()` inside the existing `loadQuote`, `resetStd` and `resetCplx` callbacks, as the last statement of each, so opening or clearing a record starts with a clean slate. Add `resetTouched` to each of those callbacks' own dependency arrays.

- [ ] **Step 6: Run the full client suite to verify nothing regressed**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS — 1789 tests (1785 pre-existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add client/src/context/touchedState.js client/src/context/CalcContext.touched.test.js client/src/context/CalcContext.jsx
git commit -m "$(cat <<'EOF'
feat(apps/client): track touched fields and save attempts in CalcContext

Adds touched/markTouched/saveAttempted/markSaveAttempted/resetTouched to
the calc context so the warning bar and the form can tell "the operator
has not filled this in yet" apart from "the operator got this wrong".
resetTouched fires on loadQuote/resetStd/resetCplx so a freshly opened
record starts clean.

The set logic lives in a pure touchedState.js helper so it is testable
without a React renderer, and so the return-same-reference-on-no-op
guarantee that prevents per-keystroke re-renders is pinned by a test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Mark required fields and wire errors to their inputs

**Files:**

- Modify: `client/src/components/Shared/RfqInfoCard.jsx:100-110` (the `ccl_pn` field block) and the sibling `moq` / `annual_qty` field blocks
- Modify: `client/src/components/Shared/RfqInfoCard.css` (add `.sc-field-error` and `.sc-required` rules)

**Interfaces:**

- Consumes: four NEW props, passed in by the two header components (both of which already call `useCalc()`): `warnings: Warning[]`, `touched: string[]`, `saveAttempted: boolean`, `onTouch: (field: string) => void`. Plus `gateWarnings` (Task 2).
- Produces: nothing consumed by later tasks.

This is the component shared by BOTH the Standard and Complex windows, so this task fixes both.

**Two corrections to the original draft of this plan, made after reading the component:**

1. **`RfqInfoCard` must NOT call `useCalc()`.** It is a presentational component — it currently has zero context imports and is driven entirely by `state` / `onChange` props. Calling the calc context inside it would couple a shared component to one provider and break any render outside it. Both call sites (`CalcHeader.jsx:16`, `CplxHeader.jsx:16`) already destructure `useCalc()`, so they pass the values down as props instead.

2. **Match warnings through `realKey()`, not the raw key.** The card maps logical field names to real state keys via `aliasMap` (`realKey(k)`). Today `aliasMap` is `{ end_cu: 'project' }` on Standard only, so the three fields in this task are unaffected — but `errorFor` must still resolve through `realKey` or the join silently breaks the first time someone aliases one of them.

- [ ] **Step 1: Add the required marker and error wiring to the `ccl_pn` field**

Replace the `ccl_pn` field block at `client/src/components/Shared/RfqInfoCard.jsx:100-110` with:

```jsx
<div className={`sc-field${errorFor('ccl_pn') ? ' sc-field-error' : ''}`}>
  <label htmlFor={fid('ccl_pn')}>
    CCL PN (80#)
    <span className="sc-required" aria-hidden="true">
      *
    </span>
  </label>
  <input
    id={fid('ccl_pn')}
    type="text"
    required
    aria-required="true"
    aria-invalid={errorFor('ccl_pn') ? 'true' : undefined}
    aria-describedby={errorFor('ccl_pn') ? fid('ccl_pn') + '-err' : undefined}
    value={get('ccl_pn')}
    onChange={(e) => set('ccl_pn', e.target.value)}
    onBlur={() => onTouch(realKey('ccl_pn'))}
    className="sc-input sc-inp-yellow"
  />
  {errorFor('ccl_pn') && (
    <span className="sc-field-msg" id={fid('ccl_pn') + '-err'} role="alert">
      {errorFor('ccl_pn').message}
    </span>
  )}
</div>
```

- [ ] **Step 2: Accept the new props and add the `errorFor` helper**

Add the import at the top of `RfqInfoCard.jsx` (one import only — no context import):

```jsx
import { gateWarnings } from '../../services/calcValidation';
```

Extend the props destructure at line 31:

```jsx
export default function RfqInfoCard({
  state,
  onChange,
  onGenerateRfq,
  npiOwners = [],
  designProcessOpts = [],
  tradeModeOpts = [],
  datalistId,
  aliasMap,
  warnings = [],
  touched = [],
  saveAttempted = false,
  onTouch = () => {},
}) {
```

The defaults matter: they keep every existing render of this component working unchanged until its call site is updated, so Step 5 can be verified independently.

After the existing `get` / `set` / `fid` definitions, add:

```jsx
// Gated once per render, not once per field — errorFor() is called for
// every field below and re-filtering inside it would be O(fields × warnings).
const gated = gateWarnings(warnings, { touched, saveAttempted });

// Warning for one field, or null. Resolves through realKey() so an
// aliased field (Standard maps end_cu → project) still joins correctly.
const errorFor = (k) => {
  const key = realKey(k);
  return gated.find((w) => w.field === key && w.severity === 'error') || null;
};
```

Everywhere the field blocks call `markTouched('x')`, call `onTouch(realKey('x'))` instead.

- [ ] **Step 3: Repeat for `moq` and `annual_qty`**

Apply the identical pattern to the `moq` and `annual_qty` field blocks in the same file: `required`, `aria-required="true"`, `aria-invalid`, `aria-describedby`, `onBlur={() => markTouched('moq')}` / `markTouched('annual_qty')`, the `*` marker in the label, and the `sc-field-msg` span. Repeat the markup rather than extracting a component in this task — extraction is a separate refactor and would widen the diff past what a reviewer can check against the audit.

- [ ] **Step 4: Add the styles**

Append to `client/src/components/Shared/RfqInfoCard.css`:

```css
/* Required marker — red asterisk, aria-hidden so screen readers get the
   information from aria-required instead of hearing "star". */
.sc-required {
  color: var(--color-danger-600, #dc2626);
  margin-left: 2px;
}

/* Field-level error. Border AND message, never colour alone — operators
   on the floor use this on cheap panels and some are colour-blind. */
.sc-field-error .sc-input {
  border-color: var(--color-danger-600, #dc2626);
}

.sc-field-msg {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-danger-600, #dc2626);
}
```

- [ ] **Step 5: Thread the props from both call sites**

`RfqInfoCard` is rendered in exactly two places, and both already destructure `useCalc()`.

In `client/src/modules/cost/tabs/StandardCalc/CalcHeader.jsx`, extend the existing destructure on line 16 and pass the props at line 276:

```jsx
const { stdState, cplxState, setStdField, dispatch, touched, saveAttempted, markTouched } =
  useCalc();
const warnings = useMemo(() => validateStandard(stdState, lib), [stdState, lib]);
```

```jsx
<RfqInfoCard
  state={st}
  onChange={handleField}
  onGenerateRfq={generateRfqNumber}
  npiOwners={npiOwners}
  designProcessOpts={designProcessOpts}
  tradeModeOpts={tradeModeOpts}
  datalistId="npi-owners-list"
  aliasMap={{ end_cu: 'project' }}
  warnings={warnings}
  touched={touched}
  saveAttempted={saveAttempted}
  onTouch={markTouched}
/>
```

Keep the existing `aliasMap` comment above that prop — it documents the legacy `end_cu → project` data shape.

In `client/src/modules/cost/tabs/ComplexCalc/CplxHeader.jsx`, the same on line 16 and line 58, using the Complex validator:

```jsx
const { stdState, cplxState, setCplxField, touched, saveAttempted, markTouched } = useCalc();
const warnings = useMemo(() => validateComplex(cplxState, lib), [cplxState, lib]);
```

```jsx
<RfqInfoCard
  state={cs}
  onChange={handleField}
  onGenerateRfq={generateRfqNumber}
  npiOwners={npiOwners}
  designProcessOpts={designProcessOpts}
  tradeModeOpts={tradeModeOpts}
  datalistId="cc-npi-owners-list"
  warnings={warnings}
  touched={touched}
  saveAttempted={saveAttempted}
  onTouch={markTouched}
/>
```

Add the validator and `useMemo` imports to each file:

```jsx
import { useMemo } from 'react';
import { validateStandard } from '../../../../services/calcValidation';
```

(`validateComplex` in `CplxHeader.jsx`.) If `useMemo` is already imported in that file, extend the existing import rather than adding a second one.

- [ ] **Step 6: Verify in the running app**

Start the app, open **Pricing (Std)** → a new record.

Expected on open: no red fields, no error bar, no asterisk-triggered errors. The three asterisks are visible.
Expected after clicking into **CCL PN (80#)** and tabbing out while empty: that one field turns red with the message `CCL Part Number is required` directly beneath it, and the bottom bar shows exactly one error.
Expected: MOQ and EAU stay quiet until touched.

Confirm the a11y wiring from the browser console:

```js
const el = document.querySelector('input[aria-invalid="true"]');
({
  describedBy: el?.getAttribute('aria-describedby'),
  msg: document.getElementById(el?.getAttribute('aria-describedby'))?.textContent,
});
```

Expected: an id string and the matching message text — not `null`.

- [ ] **Step 7: Run the full client suite**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/Shared/RfqInfoCard.jsx client/src/modules/cost/tabs/StandardCalc/CalcHeader.jsx client/src/modules/cost/tabs/ComplexCalc/CplxHeader.jsx client/src/components/Shared/RfqInfoCard.css
git commit -m "$(cat <<'EOF'
feat(apps/client): mark required RFQ fields and tie errors to their inputs

The header form told operators "CCL Part Number is required" from a bar
at the bottom of the screen while no field on the form was marked
required at all — measured: 25 fields, 0 with required/aria-required, 0
with aria-invalid, 0 with aria-describedby. Finding the offending input
meant guessing among 25.

Marks ccl_pn/moq/annual_qty required, shows the message under the field
that caused it, and wires aria-invalid + aria-describedby so screen
readers get the reason and not just the field name. Errors surface on
blur via the Task 2 gate, so a fresh record still opens clean.

RfqInfoCard is shared by the Standard and Complex windows, so this
lands in both.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Make the warning bar respect the gate

**Files:**

- Modify: `client/src/components/Layout/WarningBar.jsx:21-40`

**Interfaces:**

- Consumes: `gateWarnings` (Task 2); `touched` / `saveAttempted` from `useCalc()` (Task 3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Gate the memoised warnings**

In `client/src/components/Layout/WarningBar.jsx`, extend the import on line 21:

```jsx
import { validateByActiveTab, gateWarnings } from '../../services/calcValidation';
```

Pull the new context values out of the existing `useCalc()` destructure:

```jsx
const { stdState, cplxState, touched, saveAttempted } = useCalc();
```

Replace the `warnings` memo with a gated one:

```jsx
const warnings = useMemo(() => {
  if (!isCalcTab) return [];
  const raw = validateByActiveTab(activeTab, stdState, cplxState, lib);
  return gateWarnings(raw, { touched, saveAttempted });
}, [isCalcTab, activeTab, stdState, cplxState, lib, touched, saveAttempted]);
```

The component already returns `null` when `warnings.length === 0`, so a fresh record now renders no bar at all with no further change.

- [ ] **Step 2: Verify in the running app**

Open **Pricing (Std)** → new record.

Expected: **no warning bar on open.** Before this plan it read `⚠ 7 errors + 1 warning · [Header] CCL Part Number is required · +7 more`.
Expected: after touching and clearing CCL PN, the bar appears showing exactly that one error.
Expected: pressing **Save** on an incomplete record surfaces the full list again, and Save is still refused.

- [ ] **Step 3: Confirm the bar count matches the fields lit red**

With CCL PN and MOQ both touched and empty, in the browser console:

```js
({
  barText: document.querySelector('.warning-bar')?.innerText.replace(/\s+/g, ' ').slice(0, 80),
  redFields: document.querySelectorAll('input[aria-invalid="true"]').length,
});
```

Expected: the bar reports 2 errors and `redFields` is 2. A mismatch means `RfqInfoCard` and `WarningBar` are gating on different inputs — fix by passing the same `warnings` array to both rather than validating twice.

- [ ] **Step 4: Run the full client suite**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Layout/WarningBar.jsx
git commit -m "$(cat <<'EOF'
fix(apps/client): stop the warning bar firing on a freshly opened record

WarningBar re-ran the validators on every state change including the
first, so opening a new Standard or Complex record greeted the operator
with "7 errors + 1 warning" before a single keystroke. People learn to
ignore a bar that is always red.

Runs the same gate the fields use: warnings appear per field on blur,
and in full once Save is pressed. The component already returns null on
an empty list, so a clean record now renders no bar at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** The audit's validation finding has four measured parts. `requiredMarked: 0` → Task 4 Step 1/3. `fieldsWithAriaInvalid: 0` → Task 4 Step 1/3. `fieldsWithAriaDescribedby: 0` → Task 4 Step 1/3. `7 errors on an untouched 25-field form` → Tasks 2, 3, 5. The audit's separate finding that the error bar is duplicated across MDI windows with identical text is **not** covered here — it belongs to the window-manager plan, because the fix is per-window bar ownership, not validation.

**Placeholder scan.** No TBD, no "add appropriate error handling", no "similar to Task N". Task 4 Step 3 deliberately says "repeat the pattern" and states why extraction is out of scope; the pattern it repeats is written out in full in Step 1.

**Type consistency.** `field` is a string in Task 1 and read as `w.field` in Tasks 2 and 4. `gateWarnings(warnings, { touched, saveAttempted })` has the same signature in Tasks 2, 4 and 5. `markTouched(field)` is defined in Task 3 and called in Task 4. `addTouched(touched, field)` is defined and used only in Task 3.

**Known gap.** Task 4 Step 2 assumes `RfqInfoCard` can receive the active record's `warnings`. If the parent does not already compute them, the first implementer must thread that prop through — the alternative (validating inside the card) doubles validator cost on every keystroke and is called out as wrong in that step.
