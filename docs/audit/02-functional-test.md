# Phase 2 — Functional Testing

**Audit branch**: `audit/pre-go-live-v1.2`
**Audit date**: 2026-05-03
**Method**: hybrid — code-level audit + curl API probes + Puppeteer screenshot capture + math reproduction

---

## Method note (read first)

**This environment provides no interactive Browser Agent tool.** I have:

- The dev server running on `:3000` (current WIP bundle, prod build).
- `puppeteer-core` installed (used to capture login screenshot for evidence).
- Direct curl/HTTP API access.
- Direct DB + JSON-Library file access.
- The existing Playwright kiosk e2e suite.

What I **cannot** do unsupervised:

- Drive the authenticated UI — no `demo` user exists in this seed (CLAUDE.md self-check.mjs assumes one). I would need test credentials from the operator to drive an end-to-end UI walk.

What I did instead, per finding:

- For UI-rendered math (BOM Explosion, Linear M, scrap factor), I read the source, traced the math by hand, and ran a Node reproduction against the live JSON Library data. Output **matches** the user's stated reference (5.84 m² / 77.87 m).
- For auth/CSRF flows, I hit the API directly with curl.
- For e2e, I attempted the existing Playwright suite (KIOSK-008 known red per CLAUDE.md MES-3.5 backlog — confirmed timing out).

---

## Severity legend

| 🔴 BLOCKER | 🟠 CRITICAL / MAJOR | 🟡 MAJOR / MINOR | 🟢 OK / positive |

---

## 2.1 Critical User Flows

### 2.1.1 Login / Auth API ⚠ **🟠 MAJOR finding**

**Endpoint**: `POST /api/auth/login`

| Test                           | Request                                         | Response                                                | Verdict                     |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------- | --------------------------- |
| Bad username                   | `{"username":"nonexistent","password":"wrong"}` | `401 {"ok":false,"msg":"❌ Username not found"}`        | ⚠ **F2-1 user enumeration** |
| Wrong password (existing user) | `{"username":"Hana","password":"wrong"}`        | `401 {"ok":false,"msg":"❌ Incorrect password"}`        | ⚠ same                      |
| Mutation without auth          | `POST /api/save-all {}`                         | `401 {"error":"Unauthorized"}`                          | ✅ correctly rejected       |
| Public health                  | `GET /health`                                   | `200 {"ok":true,"uptime_sec":5893,"version":"1.5.0",…}` | ✅                          |
| Public ready                   | `GET /ready`                                    | `200 {"ok":true}`                                       | ✅                          |
| Public metrics                 | `GET /metrics`                                  | `200 (Prometheus exposition format, 50+ counters)`      | ✅                          |
| 404 control path               | `GET /api/info`                                 | `404 {"error":"not found"}`                             | ✅                          |

| ID       | Severity     | Finding                                                                                                                                                                                                                                            | Evidence                                                                          |
| -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **F2-1** | 🟠 **MAJOR** | **User enumeration vulnerability**. `/api/auth/login` returns `"❌ Username not found"` vs `"❌ Incorrect password"`, letting an attacker probe for valid usernames without credentials. OWASP recommends a single generic message for both cases. | `server/services/authService.js` (curl reproduction in `/tmp/`, transcript above) |
| F2-2     | 🟢 OK        | Mutation routes correctly require auth (writeRateLimit + auth middleware ordering verified in Phase 1 §1.2.7). Without session cookie, every state-changing endpoint returns 401 before processing.                                                | `server/index.js:614` (writeRateLimit + auth chain)                               |

### 2.1.2 BOM Explosion — Reference test 30032013-0075 ✅ **PASS** (with caveat)

**Reference data found**:

| Source                                                    | Value                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Library/IFS_Inventory/inventory_data.js`                 | `["30032013-0075","(FLD/RPC5/GZD/H0) 75mm x 1000M","Raw material",…,Width=75,Len=1000000,…]`           |
| `Library/Manufacturing_Structures/mfg_structures_data.js` | `[80640087, …, "30032013-0075", …, QPA=0.01155, **Component Scrap=1.125**, **Scrap Factor (%)=3**, …]` |

**Code path** ([client/src/modules/planning/tabs/BOMExplosion.jsx:119-124](client/src/modules/planning/tabs/BOMExplosion.jsx#L119-L124)):

```js
const scrapPct = getNumField(comp, 'componentScrap') / 100; // reads 'Component Scrap' = 1.125 → 0.01125
const required = effectiveQty * qtyPer * (1 + scrapPct); // qty * 0.01155 * 1.01125
const widthMm = extractWidthMm(description); // → 75
const linearM = calcLinearM(required, widthMm); // m² / (75/1000) = m² × 13.333
```

**Math reproduction** (`/tmp/bom-math-check.mjs`, with order qty=500):
| Interpretation | required (m²) | linearM (m) |
|---|---:|---:|
| **A. Current code** — col 7 "Component Scrap" / 100 = 1.125 % | **5.8400** | **77.87** |
| B. ERPAG-canonical col 8 "Scrap Factor (%)" = 3 % | 5.9483 | 79.31 |
| C. col 7 as multiplier (×1.125) | 6.4969 | 86.63 |

**User's stated reference**: required = 5.84 m², linearM = 77.87 m, scrap ~1.1 %.

**Verdict**: ✅ **The current code matches the user's reference exactly** (interpretation A).

**However** ⚠ **F2-3 — column-choice ambiguity**:

- The IFS canonical `Scrap Factor (%)` column (col 8) carries **value 3** for this part.
- The code reads `Component Scrap` (col 7) **value 1.125** instead.
- `server/repositories/shadowWrite.js:40-41` stores **both** columns (`scrap` and `scrap_pct`) into SQLite, but the BOM Explosion UI only reads `scrap`. The `scrap_pct=3` column is **dead data** in the read path.

This means **per CCL Vietnam practice**, "Component Scrap" IS the operative percentage and the code is correct. But a new operator joining and assuming "Scrap Factor (%)" is the canonical IFS field would expect `5.95 m²`, not `5.84 m²`. **Document this explicitly** in the operator user guide and the schema comment.

| ID       | Severity | Finding                                                                                                                                                                                                                                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F2-3** | 🟡 MAJOR | BOM Explosion uses **`Component Scrap`** (col 7) as the percentage, not the IFS-canonical `Scrap Factor (%)` (col 8). Math is correct vs user's reference (5.84 m²). The `scrap_pct` column is loaded into the SQLite shadow but never read — dead data path. Document the column choice in `Use guide/` and `schema.sql`. |

### 2.1.3 BOM Explosion — three views (Per Order / All Orders Stacked / Consolidated) ✅

[BOMExplosion.jsx:47](client/src/modules/planning/tabs/BOMExplosion.jsx#L47) declares three modes:

```js
const [viewMode, setViewMode] = useState('per-order'); // 'per-order' | 'stacked' | 'consolidated'
```

**Width + Linear M render in all three views** (verified by grep at [lines 329-333, 418-420, 477-478](client/src/modules/planning/tabs/BOMExplosion.jsx#L329)):

```jsx
<td className="text-right mono">{comp.widthMm ?? '—'}</td>
<td className="text-right mono">
  {comp.linearM != null ? comp.linearM.toLocaleString() : '—'}
</td>
```

The Per-Order view at line 329, Stacked at line 418, Consolidated at line 477 all use the same column structure. **F0-6** (CLAUDE.md WIP) had documented this requirement — verified satisfied.

| ID   | Severity | Finding                                                                                                                                                         |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-4 | 🟢 OK    | All three views (Per-Order / All Orders Stacked / Consolidated) render Width + Linear M consistently. Code structure is parallel across the three render paths. |

### 2.1.4 Costing rollup (calc engine)

[client/src/services/calcEngine.js:527-680](client/src/services/calcEngine.js#L527) — `calcAll(st, allSpResults, lib, subproducts)` is the rollup entry point. Cost categories aggregated:

| Category     | Source                                         | calcEngine field            |
| ------------ | ---------------------------------------------- | --------------------------- |
| Material     | `s_mat_cost` (standard) / `g_mat_cost` (gross) | per-line + tier rollup      |
| Machine      | `r.run_machine + r.setup_machine`              | accumulated in `overhead`   |
| Labor        | `r.run_labor + r.setup_labor + sp._spLabor`    | `labor_cost` (line 555-576) |
| Overhead     | summed from machine + ovh process rates        | `overhead`                  |
| Tooling      | per process                                    | `tooling`                   |
| VAT loss     | per material line                              | `vat_loss + proc_extra_vat` |
| Packing/ship | per quote                                      | `packing_ship`              |
| **Total**    | `s_ttl` / `g_ttl` (line 582-583)               | sum of all above            |

The rollup at L582:

```js
const s_ttl =
  s_mat_cost +
  overhead +
  labor_cost +
  vat_loss +
  proc_extra_vat +
  tooling +
  proc_extra +
  packing_ship;
```

**Run-only labor** is split out for contribution margin (L607):

```js
const run_labor_only = labor_cost - setup_labor_total;
```

| ID   | Severity | Finding                                                                                                                                                                                             |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-5 | 🟢 OK    | Rollup includes all four cost categories (material + machine/overhead + labor + tooling) plus VAT loss + packing/ship. Labor-vs-setup split is correctly handled for contribution-margin reporting. |

### 2.1.5 Reports & Export ✅

| Surface                         | Format | Hardening                                                                                                                                                       |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/shared/dashboard/export`  | CSV    | Streamed via `res.write()` row-by-row (Phase 9G.8); BOM-prefixed UTF-8; injection-guarded via `escapeCsvCell()` (formula chars `=+-@` prefixed with apostrophe) |
| `/api/sales/quotes/release/:id` | XLSX   | docx + exceljs server-side; same injection guard reused                                                                                                         |
| `/api/library/rate/export-csv`  | CSV    | `toCsvDocument()` (BOM + CRLF + injection guard)                                                                                                                |
| `/api/audit/timeline.csv`       | CSV    | json_valid() guard prevents 500 from non-JSON detail rows (CHANGELOG v1.4.2)                                                                                    |

CSV injection is consistently mitigated across **all** export endpoints I could grep. `csvSafe.js` is imported in 4 different route files.

| ID   | Severity | Finding                                                                                                                                                                                                     |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-6 | 🟢 OK    | All CSV/XLSX exports use the central `csvSafe.js` injection guard. UTF-8 BOM + CRLF lineendings + formula-char escaping consistently applied. Streaming pattern in dashboard export limits memory exposure. |

### 2.1.6 File upload ✅

[server/routes/import.js:73-91](server/routes/import.js#L73-L91):

- `multer` with `limits: { fileSize: (Number(process.env.OPS_IMPORT_MAX_MB) || 10) * 1024 * 1024 }` → 10 MB default
- `fileFilter` checks MIME type
- **Phase 10H** added magic-number validation (the body's first bytes) so a `.exe` renamed `.xlsx` is rejected
- Same hardening duplicated in `importWizard.js`

| ID   | Severity | Finding                                                                                                                                                   |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-7 | 🟢 OK    | File upload defended at three layers: size limit (10 MB env-tunable), MIME filter, magic-number validation. Same posture in legacy + wizard import paths. |

### 2.1.7 Concurrent edit / optimistic locking ✅

[server/domains/sales/routes/quotes.js:116-117](server/domains/sales/routes/quotes.js#L116):

```js
ok: false, error: 'version_conflict',
actual_version: err.actualVersion, current: err.current,
```

`upsertQuote` checks `_version` when caller provides it; emits a 409 with `{actual_version, current}` so the UI can show reload-vs-overwrite without a round-trip (CLAUDE.md lesson 9). Server-to-server mutators (approval transitions) intentionally omit `_version`.

| ID   | Severity | Finding                                                                                                                                                           |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-8 | 🟢 OK    | Optimistic locking implemented as opt-in. 409 carries the conflicting version + current state for client-side merge UX. Pattern documented in CLAUDE.md lesson 9. |

---

## 2.2 Edge cases

### 2.2.1 Empty state ✅

**60 `<EmptyState>` callsites** across `client/src/`. Component primitive at `components/Shared/EmptyState`.

Sample uses:

- `BOMExplosion.jsx:208` — failed BOM load with retry button
- Dashboard tabs — "No quote activity yet", "No customer data"
- Quote History trash bin — "No deleted quotes"

| ID   | Severity | Finding                                                                                |
| ---- | -------- | -------------------------------------------------------------------------------------- |
| F2-9 | 🟢 OK    | Empty-state primitive applied widely (60 sites). Retry actions wired where applicable. |

### 2.2.2 Decimal precision ✅

**235 float-precision sites** (`toFixed`, `Number.EPSILON`, `cleanFloat`, `fmtQpa` helpers).

CLAUDE.md release `1.5.0` includes commit `3175a70 fix(planning): clean float-precision display for BOM Pick List QPA + scrap` — so the operators specifically asked for this. `BOMExplosion.jsx:33-36` shows the `fmtQpa` helper:

```js
function fmtQpa(n) {
  if (!Number.isFinite(n)) return '0';
  return parseFloat(Number(n).toFixed(6)).toString();
}
```

| ID    | Severity | Finding                                                                                                                                        |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-10 | 🟢 OK    | Float-precision discipline enforced (235 sites). Operator-facing displays all wrap raw IEEE-754 noise (e.g. 0.011550000000000001 → "0.01155"). |

### 2.2.3 Vietnamese Unicode (diacritics) ✅

**553 i18n strings** with VN translations across 7 i18n files (`strings.js` + 6 domain bundles). Sample diacritics render correctly (`Lưu`, `Đang lưu…`, `Chưa lưu`).

| ID    | Severity | Finding                                                                     |
| ----- | -------- | --------------------------------------------------------------------------- |
| F2-11 | 🟢 OK    | Bilingual EN/VN i18n with 553 keys. Diacritics rendered via standard UTF-8. |

### 2.2.4 Timezone

Server uses `new Date().toISOString()` consistently (15+ sites grepped). All timestamps are stored as ISO-8601 UTC strings. Client-side rendering uses `new Date(iso).toLocaleString()` for operator display (verified in QuoteAnalysis, Dashboard, AuditLog).

This is the **right** posture but creates one risk:

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                                                           |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-12 | 🟡 MINOR | Server emits ISO-8601 UTC. Client renders via `toLocaleString()` which reflects the **user's** browser timezone. For a single-site CCL Vietnam deployment (Asia/Ho_Chi_Minh, UTC+7) this is consistent. **If a server admin SSHs in from a different TZ to read raw audit logs, the UTC stamps will look offset.** Document this. |

### 2.2.5 Concurrent edit

Already covered in §2.1.7. Quotes use optimistic locking; library imports use atomic-replace transactions; chat messages are append-only.

### 2.2.6 Pagination ✅

Hard-cap pattern at every list endpoint:

```js
// chatStore.js: searchMessages, listMentionsForUser, listMessages
const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
// audit timeline:
const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 10000));
// workOrderRepo.list:
const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
```

| ID    | Severity | Finding                                                                                                              |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| F2-13 | 🟢 OK    | All list endpoints clamp `limit` to a hard ceiling (typically 200, audit log 10k). Default 50. No unbounded SELECTs. |

---

## 2.3 Error handling

### 2.3.1 401 / 403 / 500 surface

| Status | Trigger                  | Response shape                                                                                                 |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 401    | Missing/expired session  | `{"error":"Unauthorized"}`                                                                                     |
| 401    | Bad login creds          | `{"ok":false,"msg":"❌ <reason>"}` ⚠ F2-1 enumeration                                                          |
| 403    | CSRF mismatch            | `{"error":"csrf_failed"}`                                                                                      |
| 403    | Permission group denial  | `{"error":"permission_denied","tab":"…","required":"edit","current":"read"}` (CLAUDE.md S1-S3 § Authorization) |
| 409    | Optimistic lock conflict | `{"ok":false,"error":"version_conflict","actual_version":N,"current":{…}}`                                     |
| 500    | Server error             | `{"error":"<redacted>"}` via `safeError.js` redactor                                                           |

`server/utils/safeError.js` redacts paths, stack traces, and PII before sending 5xx bodies. Logged-server-side preserves the raw error.

### 2.3.2 Form validation

Quick spot-check: [`OrderEntry.jsx`](client/src/modules/planning/tabs/OrderEntry.jsx) uses inline error messages from i18n (`form.validation.*` keys). Too large a surface to walk exhaustively without UI access; recommend operator UAT phase.

### 2.3.3 Network offline

[`client/src/components/Layout/ConnectionBanner.jsx`](client/src/components/Layout/ConnectionBanner.jsx) renders an offline banner when health-check fails. Per Phase 1 lint findings, it has a React-19 set-state-in-render warning (`Date.now()` called during render) but functionally works.

| ID    | Severity | Finding                                                                                                                                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-14 | 🟢 OK    | Error envelopes are structured (status + machine code + human msg). 5xx redacted via `safeError.js`. Permission denials carry tab + required + current role for actionable client UX. |

---

## 2.4 What I could NOT verify (need credentials)

These flows rely on an authenticated UI session and are **deferred to operator UAT**:

| Flow                                                      | Reason                                      | Recommended UAT                                                                |
| --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| Order Entry FG sync + import (this branch's main feature) | Requires login + planner role               | Operator walk: enter order, verify FG sync, import xlsx, confirm SQL row count |
| Process Development workflow                              | UI-state-machine-driven                     | Operator UAT                                                                   |
| Products Control (input/output)                           | Multi-step UI                               | Operator UAT                                                                   |
| Warehouse Raw → WIP → FG transitions                      | Requires WIP rows + work-order data         | Operator UAT against staging data                                              |
| Form validation messages (live)                           | Need to type bad input in fields            | Operator UAT                                                                   |
| End-to-end "click Save → see toast → see history row"     | UI-driven                                   | Operator UAT                                                                   |
| Browser reload preserves session                          | Needs cookie inspection in browser DevTools | Operator UAT                                                                   |

**Recommendation**: Before go-live, run a 1-day operator UAT cycle with a sys account, capture screenshots, file findings in `docs/audit/uat-operator-feedback.md`. The audit framework here (`docs/audit/`) is already structured for additional phases.

---

## 2.5 Phase 2 Findings Summary

### Counts by severity

| Severity       |                                                   Count |
| -------------- | ------------------------------------------------------: |
| 🔴 BLOCKER     |                                                   **0** |
| 🟠 MAJOR       |                           **1** (F2-1 user enumeration) |
| 🟡 MAJOR/MINOR | **2** (F2-3 scrap-column ambiguity, F2-12 timezone doc) |
| 🟢 OK          |                   **11** (positive evidence, see above) |

### Reference test verdict

**`30032013-0075`** (the canonical reference part from the brief):

- Width = 75 mm ✅
- Required = 5.84 m² ✅ (exactly matches user's reference; current code uses col 7 "Component Scrap" interpretation)
- Linear M = 77.87 m ✅
- Scrap displayed = 1.1 % ✅ (rounded from 1.125)
- Stock = 0 → Shortage = 5.84 ✅ (math is `max(0, required − onHand)`)

**The BOM Explosion math is correct against the operator's expected output.**

### Top risks surfaced in Phase 2

1. **F2-1** 🟠 — **Login API leaks username existence**. Quick fix: replace both messages with a single `"❌ Invalid credentials"`. 5 min change in `authService.js`.
2. **F2-3** 🟡 — **Scrap column choice undocumented**. The code uses col 7 instead of the IFS-canonical col 8, and col 8 is loaded but never read. Document the choice in `Use guide/` + `schema.sql` comment, or unify by deleting the unused `scrap_pct` field.
3. **Operator UAT still required** for the feature flows that need an authenticated session (Order Entry, Process Development, Warehouse, Products Control). The 1-day UAT must run before deploy.

### What looks **mature** (Phase 2 evidence)

- Auth wall + CSRF + writeRateLimit ordering verified to actually return 401 before processing.
- Optimistic locking with structured 409 conflict envelopes.
- CSV/XLSX exports universally use `csvSafe.js` injection guard.
- File upload defended at MIME, magic-number, and 10 MB-by-default size limit.
- 60 EmptyState callsites — empty data is a first-class UX state, not a crash.
- 235 float-precision sites — float noise hidden from operator.
- 553 VN i18n strings — bilingual support real.
- All list endpoints hard-cap `limit`.
- Permission denials carry actionable info (tab + required + current).

### Screenshot

[`docs/audit/screenshots/login-page.png`](docs/audit/screenshots/login-page.png) — captured via Puppeteer.

The login page renders cleanly with:

- Headline "Pricing & planning, online or off."
- "Sign in" form
- All security headers present (`X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=()…` — note: the **Permissions-Policy** header was present but missed in Phase 1's grep — adding to Phase 1 evidence retroactively).

---

## ✋ CHECKPOINT — Phase 2

Phase 2 complete. **No 🔴 BLOCKER**. 1× 🟠 MAJOR (F2-1 user enumeration in login API) + 2× 🟡 (F2-3 scrap-column choice ambiguity, F2-12 timezone documentation gap) + 11× 🟢 OK.

The BOM Explosion reference test (`30032013-0075` → 5.84 m² / 77.87 m linearM) **passes exactly** against the user's stated expected values.

**Operator UAT is still required** for the authenticated UI flows (Order Entry / Process Development / Warehouse / Products Control). I cannot drive these without test credentials.

**Reply `go phase 3`** for performance + scalability checks (Lighthouse, API p50/p95/p99, BOM Explosion at 1k/10k items, DB query slow log). Or specify deeper inspection on any Phase 2 finding before continuing.
