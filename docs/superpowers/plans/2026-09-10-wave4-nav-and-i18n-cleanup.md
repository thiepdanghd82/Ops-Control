# Navigation and i18n Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop two English nav items from being indistinguishable, and let an operator who cannot read English change the language before they are asked to log in.

**Architecture:** Three small, independent changes at the edges of the app — a pair of i18n strings, a component drop-in on the login screen, and routing an already-written screen through `t()`. No component is restructured.

**Tech Stack:** React 19, the repo's own `useI18n()` hook, `node:test`.

**Spec:** UI/UX audit findings, 2026-09-10 (this session), confirmed live in the running app.

## Global Constraints

- **`strings.lint.test.js` is the gate.** Every key must carry both `en` and `vi`. This suite is the reason i18n stayed healthy while the design tokens rotted — do not add a key without both locales.
- **Do not rename tab ids.** `rfq-tracking` and `rfq-tracker` are persisted in saved window layouts (`serializeLayout` / `deserializeLayout`). Renaming an id orphans a saved layout. Only the _labels_ change.
- **Vietnamese is already correct for the nav collision.** `Danh sách RFQ` and `Theo dõi RFQ` are distinct and clear. Only the English labels collide.
- Run: `cd client && node --test 'src/**/*.test.js'` (1797 tests green as of this plan).

---

### Task 1: Make the two RFQ nav items distinguishable in English

**Files:**

- Modify: `client/src/i18n/strings.js:94` and `:99`
- Modify: `client/src/components/Layout/TopBar.jsx` (the breadcrumb label map)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing.

The sidebar shows **RFQ Tracking** under _Quoting & Pricing_ and **RFQ Tracker** under _Tracking_. In English those are the same words; the Home screen's Quick Action says "RFQ Tracker", so there is no way to tell which screen it opens. In Vietnamese the labels are already distinct, so this is an English-only defect.

- [ ] **Step 1: Write the failing test**

Create `client/src/i18n/navLabels.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS } from './strings.js';

// If STRINGS is not the exported name, import whatever strings.js exports
// as its key map — the assertion below is what matters.

test('no two nav tab labels are identical within a locale', () => {
  for (const locale of ['en', 'vi']) {
    const seen = new Map();
    for (const [key, val] of Object.entries(STRINGS)) {
      if (!key.startsWith('nav.tab.')) continue;
      const label = val[locale];
      assert.ok(label, `${key} is missing a ${locale} label`);
      const clash = seen.get(label);
      assert.equal(
        clash,
        undefined,
        `${locale}: "${label}" is used by both ${clash} and ${key} — the operator cannot tell them apart`
      );
      seen.set(label, key);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && node --test src/i18n/navLabels.test.js`
Expected: FAIL naming `nav.tab.rfq_tracking` and `nav.tab.rfq_tracker`.

If it fails instead with an import error, open `client/src/i18n/strings.js`, find the name of the exported key map, and use that name in the test's import. Do not change `strings.js` to suit the test.

- [ ] **Step 3: Rename the two English labels**

In `client/src/i18n/strings.js`:

```js
  'nav.tab.rfq_tracking': { en: 'RFQ List', vi: 'Danh sách RFQ' },
```

```js
  'nav.tab.rfq_tracker': { en: 'RFQ Progress', vi: 'Theo dõi RFQ' },
```

The English now mirrors the Vietnamese that was already right: `Danh sách` is a list of RFQs, `Theo dõi` is tracking their progress. Vietnamese is unchanged.

- [ ] **Step 4: Update the breadcrumb map to match**

In `client/src/components/Layout/TopBar.jsx`, the label map hardcodes English strings. Change the `rfq-tracking` entry's label to `RFQ List` and the `rfq-tracker` entry's to `RFQ Progress`, so the breadcrumb agrees with the sidebar.

- [ ] **Step 5: Run the tests**

Run: `cd client && node --test src/i18n/navLabels.test.js src/i18n/strings.lint.test.js`
Expected: PASS both.

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/i18n/strings.js client/src/i18n/navLabels.test.js client/src/components/Layout/TopBar.jsx
git commit -m "$(cat <<'EOF'
fix(apps/client): give the two RFQ screens distinguishable English labels

The sidebar showed "RFQ Tracking" under Quoting & Pricing and "RFQ
Tracker" under Tracking. In English those are the same words, and the
Home quick action says "RFQ Tracker", so nothing told the operator which
screen it opened.

Vietnamese was already unambiguous — Danh sách RFQ vs Theo dõi RFQ — so
the English now mirrors it: RFQ List and RFQ Progress. Tab ids are
untouched; they are persisted in saved window layouts and renaming one
would orphan a saved layout.

Adds a test asserting no two nav labels collide within a locale, so the
next added screen cannot reintroduce this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Put the language toggle on the login screen

**Files:**

- Modify: `client/src/components/Auth/LoginPage.jsx`
- Modify: `client/src/components/Auth/LoginPage.css`

**Interfaces:**

- Consumes: `LangFlagToggle` from `client/src/components/Shared/LangFlagToggle.jsx`, which takes `{ className }` and reads `useI18n()` itself.
- Produces: nothing.

`LangFlagToggle` renders only inside `HardwareSection.jsx` and `ModeSection.jsx` — both buried in Settings. An operator who cannot read English must log in through an English screen before they can reach the control that would have made it Vietnamese.

`LoginPage.jsx` already calls `useI18n()` (line 218) and makes 35 `t()` calls with zero hardcoded English, so the screen is fully translated; only the switch is missing.

- [ ] **Step 1: Import and render the toggle**

In `client/src/components/Auth/LoginPage.jsx`:

```jsx
import LangFlagToggle from '../Shared/LangFlagToggle';
```

Render it inside the sign-in card, above the `<h1>`/title, so it is the first thing reachable:

```jsx
<LangFlagToggle className="login-lang-toggle" />
```

- [ ] **Step 2: Position it**

Append to `client/src/components/Auth/LoginPage.css`:

```css
/* Top-right of the sign-in card. An operator who cannot read the form must
   be able to switch language BEFORE being asked to authenticate — the only
   other toggle lives in Settings, behind the login. */
.login-lang-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
}
```

If the sign-in card is not already a positioned ancestor, add `position: relative` to its rule rather than positioning the toggle against the page.

- [ ] **Step 3: Verify in the running app**

The installed app at `:3100` serves a built bundle. Start the dev client with its proxy temporarily pointed at `http://localhost:3100` (see wave 2 Task 2 Step 7 for the exact edit) and open the login screen **without logging in**.

Expected: the toggle is visible on the card. Clicking it switches every label — `Sign in`, `Username`, `Password`, `Remember me`, `Change password` — to Vietnamese, and the choice survives a reload.

Revert the `vite.config.js` proxy edit afterwards and confirm `git status` shows it unmodified.

- [ ] **Step 4: Run the full client suite**

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Auth/LoginPage.jsx client/src/components/Auth/LoginPage.css
git commit -m "$(cat <<'EOF'
feat(apps/client): put the language toggle on the login screen

LangFlagToggle rendered only inside HardwareSection and ModeSection, both
buried in Settings — behind the login. An operator who cannot read
English had to get through an English sign-in form before reaching the
control that would have made it Vietnamese.

LoginPage was already fully translated (35 t() calls, no hardcoded
English); only the switch was missing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Translate the TOTP enrollment screen

**Files:**

- Modify: `client/src/components/Auth/TotpEnrollment.jsx`
- Modify: `client/src/i18n/strings.js`

**Interfaces:**

- Consumes: `useI18n()`.
- Produces: nothing.

`TotpEnrollment.jsx` is 228 lines with **zero** `t()` calls and hardcoded English including `Account` and `Scan with your authenticator app`. It is mandatory security onboarding — the one screen where confusion generates a support call, and the operator has no way to skip it.

- [ ] **Step 1: Inventory every user-visible string**

```bash
grep -oE ">[A-Za-z][A-Za-z ,.'’-]{3,}<" client/src/components/Auth/TotpEnrollment.jsx
grep -oE '(placeholder|title|aria-label)="[^"]+"' client/src/components/Auth/TotpEnrollment.jsx
```

Every line of output needs a key. Do not skip `title` and `aria-label` — a translated screen with English tooltips is still half-English.

- [ ] **Step 2: Add the keys**

In `client/src/i18n/strings.js`, add one entry per string found, namespaced `totp.*`, each with both locales. The two confirmed by the audit:

```js
  'totp.account': { en: 'Account', vi: 'Tài khoản' },
  'totp.scan_prompt': {
    en: 'Scan with your authenticator app',
    vi: 'Quét bằng ứng dụng xác thực',
  },
```

Keep the Vietnamese in the register the rest of the app uses — the operator-facing desktop dialogs are the reference for tone.

- [ ] **Step 3: Route the component through t()**

Add the hook at the top of the component body:

```jsx
const { t } = useI18n();
```

with:

```jsx
import { useI18n } from '../../utils/useI18n';
```

Replace each hardcoded string with its key, e.g. `>Account<` becomes `>{t('totp.account')}<`.

- [ ] **Step 4: Assert no English survives**

Re-run the Step 1 commands.
Expected: no output, apart from strings that are deliberately not translated (a product name, a code sample). If any remain, either translate them or add a one-line comment saying why they stay.

- [ ] **Step 5: Run the i18n lint and the full suite**

Run: `cd client && node --test src/i18n/strings.lint.test.js`
Expected: PASS — this fails loudly if any new key is missing a locale.

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Auth/TotpEnrollment.jsx client/src/i18n/strings.js
git commit -m "$(cat <<'EOF'
feat(apps/client): translate the TOTP enrollment screen

TotpEnrollment.jsx had zero t() calls across 228 lines and hardcoded
English including "Account" and "Scan with your authenticator app". It
is mandatory security onboarding with no skip path, so it is exactly the
screen where an untranslated string becomes a support call.

Routes every user-visible string — including title and aria-label
attributes — through t(), with both locales. strings.lint.test.js
enforces that neither locale can be forgotten.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** The audit's navigation and i18n findings: the RFQ Tracking / RFQ Tracker collision → Task 1; no language toggle before login → Task 2; `TotpEnrollment` untranslated → Task 3. The audit also noted a Vietnamese tooltip inside an English UI (`1 người đang online — click để xem danh sách`); that string sits in `ActiveUsersIndicator.jsx`, is a single key, and is folded into no task here — worth a one-line follow-up but too small to justify its own task.

**Placeholder scan.** Task 3 Step 2 lists only the two strings the audit confirmed and instructs the implementer to derive the rest from a command whose output is deterministic. That is a generated inventory, not a placeholder — the command is given and the acceptance check in Step 4 is exact.

**Type consistency.** `LangFlagToggle` is used in Task 2 with the `{ className }` signature its definition declares. `t(key)` is used identically in Tasks 1 and 3. No new exported identifiers.

**Known risk.** Task 1 Step 1 assumes the exported name of the string map in `strings.js`. The step says explicitly to adapt the test's import to whatever `strings.js` actually exports, and never the reverse — changing a widely-imported module to suit a new test would be the wrong direction.
