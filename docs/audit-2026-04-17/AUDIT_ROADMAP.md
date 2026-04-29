# Ops Control — Deep Audit & Improvement Roadmap

**Audit date:** 2026-04-17
**Scope:** Full-stack review — client, server, calc engine, UI, data layer
**Target benchmark:** IBM Carbon / SAP ECC-level ERP, comparable to Brady & CCL Design corporate costing systems
**Reviewer perspective:** Senior Costing + Process Design + ERP Engineering

---

## 0. Executive summary

Ops Control is a **functionally complete** internal costing/quoting tool for CCL Design Vietnam, with solid foundations (pure calc engine, IBM Plex typography, useReducer state, bcrypt + TOTP auth). But it sits in the **"departmental tool"** tier — not yet at corporate ERP grade. The gap to Brady/CCL corporate is driven by **4 structural issues**:

| # | Gap | Severity | Category |
|---|---|---|---|
| 1 | **File-based `.js` DB with no transactions** — data-loss risk on concurrent imports/saves | 🔴 Critical | Data layer |
| 2 | **Scrap compounding missing in Complex assembly** — under-costs multi-component quotes | 🔴 Critical | Formula |
| 3 | **Design tokens migration ~40% complete** — 60% of CSS still hard-codes hex, 3 font families | 🟠 High | UI |
| 4 | **SubProduct reference doesn't scale MOQ** — wrong cost when parent MOQ ≠ child MOQ | 🔴 Critical | Formula |

**Maturity scorecard:**

| Domain | Score | Comment |
|---|---|---|
| Calc engine purity | 8/10 | Pure functions, testable, only edge-case bugs |
| Formula correctness | 6/10 | Standard calc good; Complex aggregation has 2 structural bugs |
| UI design system | 5/10 | Tokens exist, migration stalled, button/table sprawl |
| Backend robustness | 4/10 | No ACID, sessions in-memory, permissive CORS |
| Test coverage | 3/10 | calcEngine.test.js thin, no integration/E2E |
| Security posture | 6/10 | Auth strong; custom TOTP crypto, no input validation |
| **Overall** | **5.3/10** | *"Works reliably for current team; needs hardening for enterprise rollout"* |

**Bottom line:** With a focused **10–12 week improvement program**, Ops Control can reach **8/10** — genuinely corporate-grade, ready for multi-site rollout (CCL VN → CCL group → Brady licensing).

---

## 1. Current state — what's working ✅

1. **Pure calc engine** — `client/src/services/calcEngine.js` is fully deterministic, 11 exported functions, no React dependency. Extractable to other products (mobile app, Excel add-in).
2. **Centralized state** — `useReducer` + `CalcContext` eliminates prop drilling across 10+ sub-tabs.
3. **Nested-tab architecture** — StandardCalc sub-tabs (Header, Layout, Materials, Inks, Processes, Balancing, Packing, Breakdown, Summarize) are cleanly split, each owns its handlers.
4. **Two-pass SP resolution** — `ComplexCalc.jsx:74-132` elegantly handles SP-to-SP material references.
5. **Validation layer** — `calcValidation.js` catches MOQ=0, missing material codes, tool_life=1 bug.
6. **IBM Plex + Carbon tokens foundation** — `styles/tokens.css` is 159 lines of semantic variables (colors, spacing, typography, shadows) — professionally written baseline.
7. **Auth** — bcrypt 12 rounds, TOTP 2FA, rate limiting on login, audit log.
8. **Auto-backup** — daily snapshots under `server/data/Backup/Data/` with restore workflow.

---

## 2. Critical issues — must-fix before enterprise rollout 🔴

### 2.1 Formula: Complex assembly doesn't apply scrap to sub-product aggregation

**File:** [ComplexCalc.jsx:118-126](3.%20PROJECTS/Ops%20Control/client/src/modules/cost/tabs/ComplexCalc/ComplexCalc.jsx#L118)

Assembly aggregates `sum(sp.g_mat_cost)` directly. A 5% scrap on the assembly step isn't applied to incoming sub-component material — under-costs the assembly by ~5% per yield loss layer.

**Fix:**
```js
const agg_mat = pass2.reduce((s, r) => s + (r.g_mat_cost || 0), 0)
              / (1 - calcMatScrapFactor(cs.processes));  // apply assembly scrap
```

### 2.2 Formula: SP reference doesn't scale when parent MOQ ≠ child MOQ

**File:** [calcEngine.js:152-189](3.%20PROJECTS/Ops%20Control/client/src/services/calcEngine.js#L152)

When a material row references a SubProduct (e.g., `code="SP_A"`), the SP was computed for its own MOQ (say 100), but is referenced by an assembly with MOQ=1000. Setup amortization and tooling amortization are stuck at the child's MOQ — wrong.

**Fix:** Pass parent `moq` into SP computation OR scale setup/tooling portion of cost by `parent_moq / child_moq`.

### 2.3 Formula: Ink base_mat width parsing can produce negative width

**File:** [calcEngine.js:247](3.%20PROJECTS/Ops%20Control/client/src/services/calcEngine.js#L247)

```js
const width_m = (parseFloat(String(ink.base_mat || '').slice(-4)) || 0) / 1000;
```

If `base_mat = "ABC-200"`, `.slice(-4)` = `"-200"` → parseFloat = **−200** → width_m = **−0.2** → negative ink usage propagates downstream. No guard.

**Fix:** Extract rightmost positive number via regex `/\d+(\.\d+)?$/`; reject negatives; add unit test.

### 2.4 Formula: Contribution Margin definition inconsistent

**File:** [calcEngine.js:~420](3.%20PROJECTS/Ops%20Control/client/src/services/calcEngine.js#L420) (`calcAll`)

Current Contribution = `1 − (material + tooling + packing + labor) / sp` — **includes tooling** (which is a *fixed/period* cost, not variable).

Standard accounting: **Contribution = (SP − Variable Cost) / SP**, where variable = material + direct labor + packaging (**not tooling**).

**Fix:** Rename current metric to "Gross Margin contribution" OR redefine properly. Either way — document the choice in the Cost Breakdown tooltip so Finance doesn't misread the KPI.

### 2.5 Data layer: no ACID, file-based `.js` DB

**Files:** `server/services/dataSync.js`, all `/data/Library/*/` stores

- 17MB `materials_data.js` parsed on every import read
- Two simultaneous saves = race condition, last-write-wins
- Cache invalidation by mtime — if HTTP response fails after write, client retries → duplicate
- No rollback on partial multi-file writes in `/save-all`

**Fix:** Migrate to **SQLite** (`server/data/ops.db`) in 1–2 weeks. Keep JS file backups for compliance; run queries against DB. Wrap multi-write ops in transactions.

### 2.6 Data layer: sessions in-memory, lost on restart

**File:** [authService.js:17-20](3.%20PROJECTS/Ops%20Control/server/services/authService.js#L17)

Server restart = everyone logged out + in-flight quote edits potentially lost if not saved. Unacceptable for a production costing tool.

**Fix:** Persist `_sessions` Map to `server/data/sessions.json` on each create/update; load on startup.

### 2.7 Auth: custom TOTP crypto

**File:** [authService.js:322-384](3.%20PROJECTS/Ops%20Control/server/services/authService.js#L322)

XOR stream + SHA256 keystream derived from admin password hash. Not AEAD, no authentication tag, key reuse risk if password is weak.

**Fix:** Use **libsodium** `crypto_secretbox_easy` (authenticated encryption) with a dedicated master key stored in env var `OPS_TOTP_KEY`.

### 2.8 Security: no request validation layer

**File:** all routes under `server/routes/`

`POST /auth/users` accepts arbitrary fields; typos like `ddlSites` vs `ddlSitesDB` silently no-op (acknowledged in code comments but still unresolved).

**Fix:** Add **Zod** schemas for every request body. Reject with 400 + field-level errors.

---

## 3. High-priority improvements 🟠

### 3.1 Formula quality-of-life

| Issue | File | Fix |
|---|---|---|
| Scrap display shows additive, not compounded | CalcMaterials.jsx:38-43 | Add compounded scrap tooltip |
| SP error markers silently aggregated | calcEngine.js:406-412 | Skip SP-error rows, emit warnings array |
| `parseFloat \|\| 0` swallows NaN from bad DDL | scattered | Centralize `safeNum()` helper |
| `tool_type` substring match over-matches "jigging" | calcEngine.js:324 | Change to exact `ttNorm === 'jig'` |
| Missing SGA allocation | calcEngine.js | Add `overhead_rate_pct` applied to COGS |
| Tooling split: Jig (fixed) vs Die (unit-limited) not distinguished | calcEngine.js:320-333 | Split `tool_type_category` with separate formulas |
| Scrap cost hidden in material inflation | Cost Breakdown | Break out scrap as separate line |

### 3.2 Duplication between Standard and Complex

- `CalcHeader.jsx` and `CplxHeader.jsx` — **95% identical**. Extract `<RfqInfoCard />`.
- `CalcCostBreakdown` and `CplxCostBreakdown` — duplicated aggregate loop. Move to `calcEngine.js`.
- `CplxSummaryBar.jsx:8-25` — redefines `fmtN`, `pct`, `gmClr` already in `utils/format.js`. Import from shared.
- `MOQ Tier Setup table` — Complex-only today; likely also needed in Standard.

### 3.3 UI design system

- **Finish color token migration** — still ~60% hard-coded hex in `IFSInventory.css`, `LibFinance.css`, `RFQTracker.css`, `Settings.css`.
- **Resolve font family split** — Settings uses Apple SF Pro, rest uses IBM Plex. Pick one (recommend: IBM Plex Sans everywhere).
- **Button standardization** — 7+ button patterns exist (`.sc-btn`, `.ml-btn-add`, `.tb-btn-new`, `.ddl-site-btn`, etc.). Consolidate to `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`.
- **Unify table headers** — Summarize.css is the new gold standard (11px sticky + 12px body + tabular-nums + zebra). Apply same pattern to `MaterialLibrary.css`, `RFQTracker.css`, `LibFinance.css`, `QuoteHistory.css`, `IFSInventory.css`.
- **Tabular-nums everywhere** — already fixed for Summarize; missing in MaterialLibrary price/MOQ, RFQTracker cost column.
- **Status badges** — define `.status-active`, `.status-buildable`, `.status-won`, `.status-lost` with consistent bg/text.

### 3.4 UX gaps (professional ERP expectations)

| Gap | Where | Priority |
|---|---|---|
| No undo/redo (despite useReducer foundation) | Standard/Complex | High |
| No sticky first column on wide tables (20+ cols) | CalcMaterials | High |
| Empty states are "No data" italics | all tables | Medium |
| No loading spinner (text-only) | all tables | Medium |
| Decimal input step inconsistent | everywhere | Medium |
| No keyboard copy-paste row duplication | CalcMaterials | Medium |
| Balancing params lost on tab switch | ProcessBalancing.jsx:21 | High |
| No BOM tree visualization for Complex | ComplexCalc | High |
| No SP reordering (drag) | ComplexCalc | Medium |

---

## 4. Recommended data-model refactors

### 4.1 Complex Calc — explicit BOM + shared tooling

**Current shape:**
```js
cplxState = {
  subproducts: [{ code, materials[], inks[], processes[], ... }],
  moq, selling_price, ...
}
```

**Proposed:**
```js
cplxState = {
  assembly: {
    code: "FG_001",
    is_assembly: true,                       // explicit flag, not string prefix
    bom: [
      { sp_index: 0, qty: 2, notes: "Left label" },
      { sp_index: 1, qty: 1, notes: "Right label" },
    ],
    tooling_alloc: [
      { tool_id: "die_a", sp_index: 0, share_pct: 50 },
      { tool_id: "die_a", sp_index: 1, share_pct: 50 },
    ],
    packing_rule: "assembly",  // or "per_sp" / "mixed"
    site, trade_mode,
  },
  subproducts: [{
    code, description, main_process, part_width, part_length_md,
    materials[], inks[], processes[],
    // NO moq/selling_price — inherited from assembly
  }],
  moq, selling_price,
  moq_tiers: [{ moq, price, eau, sp_ship_qty_overrides: { 0: 200, 1: 100 } }],
}
```

**Benefits:**
- Explicit BOM qty per component (not implicit qty=1)
- Shared tooling tracked & split correctly
- No currency mismatch (SPs inherit parent context)
- No string-prefix guessing for FG detection

### 4.2 Backend — SQLite schema

```sql
-- Core tables
CREATE TABLE materials (id INTEGER PK, code TEXT UNIQUE, name TEXT, price REAL, uom TEXT, supplier TEXT, updated_at DATETIME);
CREATE TABLE work_centers (id INTEGER PK, code TEXT UNIQUE, name TEXT, machine_rate REAL, labor_rate REAL, updated_at DATETIME);
CREATE TABLE routings (id INTEGER PK, part_no TEXT, op_no INT, wc_code TEXT, op_desc TEXT, mach_setup REAL, labor_setup REAL, mach_run REAL, labor_run REAL, factor_unit TEXT, alt TEXT, rev TEXT, routing_type TEXT, UNIQUE(part_no, op_no, alt, rev, routing_type));
CREATE TABLE bom (id INTEGER PK, parent_part TEXT, component_part TEXT, qty_per_asm REAL, scrap REAL, scrap_pct REAL, uom TEXT, alt TEXT);
CREATE TABLE quotes (id INTEGER PK, rfq_no TEXT, direct_cu TEXT, state_json TEXT, created_by INT, created_at DATETIME, updated_at DATETIME);
CREATE TABLE quote_versions (id INTEGER PK, quote_id INT, version TEXT, state_json TEXT, created_at DATETIME);
CREATE INDEX idx_routings_part ON routings(part_no);
CREATE INDEX idx_bom_parent ON bom(parent_part);
CREATE INDEX idx_quotes_rfq ON quotes(rfq_no);
```

Migration script: read current `.js` files → INSERT INTO → verify row counts → swap.

---

## 5. Roadmap — phased delivery (10–12 weeks, 5 sprints × 2 weeks)

### Sprint 1 — **Data integrity & critical formula fixes** (2 weeks)
- [ ] Fix scrap compounding in Complex aggregation (`ComplexCalc.jsx:118-126`)
- [ ] Fix SP MOQ scaling in reference cost (`calcEngine.js:152-189`)
- [ ] Fix ink `base_mat` negative width parsing (`calcEngine.js:247`)
- [ ] Add `safeNum()` helper in `utils/format.js`, replace `parseFloat || 0` site-by-site
- [ ] Clarify Contribution Margin definition (doc + tooltip)
- [ ] Expand `calcEngine.test.js`: offcut, Indigo ink, tier state, SP references
- [ ] Fix `tool_type` substring over-match
- [ ] Atomic file writes (temp-rename pattern) for all `.js`/`.json` data writes
- **Exit criteria:** All Complex quotes recalculated against known-good reference; formula delta < 0.1%.

### Sprint 2 — **Backend hardening** (2 weeks)
- [ ] Persist sessions to `server/data/sessions.json`
- [ ] Add Zod schemas for all `server/routes/*` request bodies
- [ ] Tighten CORS to known origins
- [ ] Rate limit `/import/*`, `/backup/*` (10/user/day default)
- [ ] Migrate custom TOTP crypto to libsodium
- [ ] Structured logging (Pino) + request-ID middleware
- [ ] Health endpoints: `GET /health`, `GET /ready`
- [ ] Audit log: capture user promotions, role changes
- **Exit criteria:** Concurrent 5-user import test passes without data corruption.

### Sprint 3 — **SQLite migration** (2 weeks)
- [ ] Define schema (section 4.2)
- [ ] Write migration script `scripts/migrate-to-sqlite.js`
- [ ] Rewrite `services/dataSync.js` as DB query layer (keep same function signatures)
- [ ] Add transaction wrapper for `/save-all`
- [ ] Dual-write period: keep legacy `.js` file export for 2 releases (rollback safety)
- [ ] Performance benchmarks: 50k routing rows query < 200ms
- **Exit criteria:** All tabs load ≥ 2× faster; no regression in import/export functionality.

### Sprint 4 — **Design system finish** (2 weeks)
- [ ] Create `styles/semantic-tokens.css` (buttons, tables, modals, status badges)
- [ ] Migrate remaining 60% of CSS to tokens (`IFSInventory`, `LibFinance`, `RFQTracker`, `Settings`)
- [ ] Consolidate to 4 button variants (`.btn-primary/secondary/danger/ghost`)
- [ ] Apply Summarize table standard to all other tables
- [ ] Pick single font family (IBM Plex Sans), remove Apple SF Pro from Settings
- [ ] Empty state component (`components/Empty.jsx`) with icon + CTA
- [ ] Loading skeleton component (`components/SkeletonTable.jsx`)
- [ ] Accessibility: focus rings, WCAG AA contrast audit, axe-core CI
- **Exit criteria:** axe-core 0 critical, design review sign-off by stakeholder.

### Sprint 5 — **Complex Calc refactor & UX polish** (2 weeks)
- [ ] Extract `<RfqInfoCard />` shared between Standard + Complex
- [ ] Extract `calculateComplexAggregate()` from two duplicates into calcEngine
- [ ] Refactor `cplxState` to new shape (section 4.1): `assembly + bom[] + tooling_alloc[]`
- [ ] Add BOM tree view for Complex (indented rows with qty column)
- [ ] Sticky first column on wide tables
- [ ] Undo/redo (wrap reducer dispatches into history stack)
- [ ] Persist balancing params to stdState (not local state)
- [ ] Keyboard shortcuts: Ctrl+D duplicate row, Ctrl+Z undo
- **Exit criteria:** Cost engineer satisfaction survey ≥ 8/10; time-to-quote ≤ 15 min.

### Optional Sprint 6 — **Enterprise features** (2 weeks)
- [ ] Multi-site support (CCL VN + CCL China + Brady) with per-site rate tables
- [ ] Approval workflow (Cost → Sales Manager → Finance Director)
- [ ] Quote version history with diff view
- [ ] Email digest for pending approvals
- [ ] Dashboard: quote win rate, average margin, top customers

---

## 6. Key metrics to track

| Metric | Current | Target (post-roadmap) |
|---|---|---|
| Formula test coverage | ~40% | ≥ 85% |
| Time to open Mfg Structures (19k rows) | ~2s | < 500ms |
| CSS token coverage | ~40% | ≥ 95% |
| Distinct button styles | 7 | 4 |
| Font families in use | 3 | 1 |
| Session persistence on restart | ❌ No | ✅ Yes |
| Concurrent write data loss risk | 🔴 High | ✅ None (SQLite TX) |
| axe-core critical issues | Not measured | 0 |
| Quote time (cost engineer) | ~25 min | ≤ 15 min |
| Calc engine parity vs CCL corporate | Unknown | Within 1% on 20 sample quotes |

---

## 7. Pragmatic delivery principles

1. **Never break a working quote.** Every calc-engine change must run all saved quotes (Quote History) before + after → diff must be explained or fixed.
2. **Dual-run before cutover.** SQLite backend runs alongside file-based for 2 releases; compare daily checksums.
3. **Feature-flag risky changes.** Use `localStorage.ops_feature_*` to gate scrap-compounding, BOM refactor, etc. so Cost team can toggle back.
4. **Document formula intent.** Every change to `calcEngine.js` needs a comment block: *"Why this formula? Vs prior version? Reference (ISO, CCL corporate, Brady)?"*
5. **Cost team approval gate.** Finance + Cost + Production sign-off on Sprint 1 before proceeding.
6. **Backward compat for saved quotes.** All quote state in `quote_versions` — migrations must keep old quotes loadable.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite migration breaks data | Med | High | Dual-run + checksum + rollback script |
| Scrap fix changes historical quote totals | High | Med | Version quotes; only new quotes use new formula unless user re-runs |
| Cost team rejects UI changes | Med | Med | Involve Hana (Cost lead) in every sprint demo |
| Sprint 3 (SQLite) runs long | Med | Low | Cut scope: keep backup files parallel, migrate read-only first |
| TOTP crypto change locks out users | Low | High | Re-enrollment email flow + emergency bypass for admin |

---

## 9. Quick wins this week (zero risk, high visibility)

Already done in this session:
- ✅ Column order fix (UOM before Scrap) in Mfg Structures
- ✅ 5/6 decimal normalization for Qty/Scrap
- ✅ Tabular-nums + zebra + 12px body for Summarize table
- ✅ 3-decimal price in Material Library

Can ship next:
- [ ] Apply Summarize.css pattern to 6 remaining data-browser tables (1 day)
- [ ] `safeNum()` helper + replace 20+ `parseFloat || 0` sites (half day)
- [ ] Atomic file writes via `fs.writeFileSync(tmp)` + `fs.renameSync(tmp, target)` in `dataSync.js` (half day)
- [ ] Empty state component with Intl.NumberFormat (1 day)
- [ ] Structured logging with Pino (half day)

---

## Appendix A — files touched during improvement

**Critical edits:**
- `client/src/services/calcEngine.js` — formula fixes (sprints 1, 5)
- `client/src/services/calcValidation.js` — new warnings + severity links to Save
- `client/src/modules/cost/tabs/ComplexCalc/ComplexCalc.jsx` — aggregation fix, data model refactor
- `client/src/modules/cost/tabs/StandardCalc/ProcessBalancing.jsx` — persist state
- `server/services/authService.js` — session persistence, TOTP crypto swap
- `server/services/dataSync.js` — rewrite as DB layer
- `server/routes/*` — Zod validation, rate limits

**New files:**
- `server/data/ops.db` — SQLite DB
- `scripts/migrate-to-sqlite.js`
- `client/src/styles/semantic-tokens.css`
- `client/src/components/Empty.jsx`, `SkeletonTable.jsx`, `StatusBadge.jsx`
- `client/src/utils/safeNum.js`
- `server/middleware/requestId.js`, `logger.js`
- `docs/calc-formula-reference.md` — formula documentation for Finance audit

**Deprecations:**
- `server/legacy/` folder (confirm unused, remove)
- `server/routes/legacy.js`
- Custom `jsHash()` fallback in `authService.js`

---

**End of roadmap.** For questions or sprint planning support, reference this doc + linked audit agents in the `docs/audit-2026-04-17/` directory.
