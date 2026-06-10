# UAT — Pricing Snapshot (Phase 5) · Kịch bản UAT — Pricing Snapshot

Sprint: S-SNAPSHOT-PHASE-5 · Owner / Người chủ trì: Đặng Thế Thiệp
Executor / Người thực hiện: Henry solo on Mac DMG (Q1=a)
Doc language / Ngôn ngữ tài liệu: Bilingual EN + VI (Q2=b)
Scope / Phạm vi: end-to-end snapshot freeze + resolve + audit + drift detection on prod hardware

## How to use this checklist · Cách dùng checklist

Each scenario has 4 fields the operator fills in real time / Mỗi kịch bản có 4 trường người dùng điền trực tiếp:

- **Steps · Bước** — exact click path / luồng click chính xác
- **Expected · Kết quả mong đợi** — what the UI / file should do
- **Acceptance · Tiêu chí PASS** — Pass / Fail binary; partial-pass = Fail with notes (PASS / FAIL, không có "PASS một phần")
- **Notes · Ghi chú** — bug stub format below if FAIL

### Execution order · Thứ tự thực thi

Run sequentially SCN1 → SCN30. Operator block (SCN1–SCN20) requires only the running DMG + a test quote. Admin block (SCN21–SCN30) requires also: `/metrics` endpoint access, a library-mutation step (admin UI or direct JSON edit), and an xlsx viewer (Excel / Numbers).

If SCN1 FAILs, halt and triage — that's the smoke-baseline (save → freeze stamps). If SCN9 FAILs, copy-quote workflow is broken; this is gating for CCL Vietnam ops because copying old quotes is daily activity.

### Bug stub format · Mẫu báo bug

Copy under any failing scenario / Copy bên dưới kịch bản FAIL:

```
### Bug — SCN<n>: <short title>
- Severity · Mức độ: P0 blocker / P1 fix-before-go-live / P2 MVP-fix / P3 defer
- Surface: Mac DMG SERVER vX.Y.Z (SHA <8-char short>)
- Quote reference · Quote test: RFQ-XXXX-XXXX (anonymise customer name + pricing)
- Reproduce · Tái hiện: <step-by-step>
- Expected vs actual · Mong đợi vs thực tế: <one line each>
- Filed as · Ticket: MES-3-FIX-<n> (raise after UAT)
```

---

## Operator scenarios (SCN1–SCN20) · Kịch bản người dùng

### SCN1 — Std save → snapshot frozen (smoke baseline)

Smoke baseline. If FAIL, halt UAT. / Smoke test. Nếu FAIL, dừng UAT.

#### Steps · Bước

1. Login as operator account (NOT `demo`).
2. Cost → Pricing (Std). Create new quote: RFQ `RFQ-UAT-SNAP-001`, End Customer `UAT Test`, Site = VN.
3. Fill: MOQ 1000, Annual 5000, Selling Price 0.50, USD rate 24500, Part Width 50, Length MD 30.
4. Materials tab: add row `MAT-001` usage 1 s_price 5.
5. Processes tab: add row workcenter `Slit`.
6. Click **Save** (top-right).
7. Quote History → reload page (Cmd+R) → open the just-saved quote.

#### Expected · Mong đợi

- Save succeeds, redirects to Quote History.
- After reload, open quote → Cost Breakdown tab → scroll to bottom.
- **SnapshotPanel** visible at end of breakdown.
- Badge color = 🟢 **Frozen** (green, "persisted" tone).
- "Captured at · Đóng băng lúc": today's date + time within last 5 minutes.
- "Captured by · Đóng băng bởi": your username (operator account id).
- "Site": VN.
- "Library version": current `lib._version` (non-empty).
- "Materials frozen": 1; "Workcenters frozen": 1; "Coverage rows": >0.

#### Acceptance · PASS / FAIL

- [ ] Frozen badge green, captured_at within 5 min, captured_by = operator
- [ ] Counts match (1 mat, 1 wc, coverage > 0)

---

### SCN2 — Click SnapshotPanel summary row toggles open/close

#### Steps

1. From SCN1's quote, click the SnapshotPanel summary row (the row with badge + "click to toggle").
2. Click again.

#### Expected

- First click: panel expands, fields visible.
- Caret rotates from ▸ to ▾.
- Hover background slate-100 (visible affordance).
- Second click: collapse.

#### Acceptance

- [ ] Toggle works both directions, caret rotation visible

---

### SCN3 — Std reload immediately after save → snapshot persists

#### Steps

1. From SCN1, close browser tab. Reopen `http://localhost:3100` (DMG embedded server).
2. Login again. Quote History → open `RFQ-UAT-SNAP-001`.
3. Cost Breakdown → SnapshotPanel.

#### Expected

- Same snapshot metadata as SCN1 (captured_at unchanged, captured_by unchanged).
- Cost Breakdown numbers identical to SCN1 (Materials cost / Process cost / SP / GM% all match within 0.001).

#### Acceptance

- [ ] captured_at identical to SCN1
- [ ] All cost numbers identical to SCN1

---

### SCN4 — Std edit + save 2nd time → captured_at updates, captured_by stable

#### Steps

1. From SCN3's quote, change MAT-001 s_price 5 → 6.
2. Save.
3. Reload, open quote, view SnapshotPanel.

#### Expected

- captured_at is NEW (later than SCN1).
- captured_by unchanged (same operator).
- Materials frozen still 1 (no row added).
- Lib version may match or shift (depends on whether master lib mutated between saves).

#### Acceptance

- [ ] captured_at updated, captured_by stable

---

### SCN5 — Cpx save → quote-level snapshot frozen

#### Steps

1. Cost → Pricing (Cpx). Create new quote: RFQ `RFQ-UAT-SNAP-002`, End Customer `UAT Cpx Test`, Site = VN.
2. Create 2 sub-products: SP-A (MAT-002), SP-B (MAT-003).
3. Save → Quote History → reopen.
4. Cost Breakdown → SnapshotPanel.

#### Expected

- Frozen badge 🟢 (persisted).
- Materials frozen ≥ 2 (both SPs' materials union).
- Workcenters frozen ≥ count of distinct WCs across SPs.

#### Acceptance

- [ ] Cpx snapshot frozen at quote level (not per-SP), badge green

---

### SCN6 — Cpx reload identical → no drift

#### Steps

1. From SCN5, reload, open, compare numbers vs SCN5 first-open.

#### Expected

- All KPIs identical (SP, GM%, VA%, Contr%, every per-SP cost).

#### Acceptance

- [ ] Numbers match within 0.001 across reloads

---

### SCN7 — Cpx delete sub-product + save → snapshot re-freezes only used rows

#### Steps

1. From SCN5, delete SP-B.
2. Save → reload → SnapshotPanel.

#### Expected

- Materials frozen count drops (now only SP-A's mats).
- captured_at updates.

#### Acceptance

- [ ] Snapshot row count reflects only used materials post-delete

---

### SCN8 — Cpx site change → site field in snapshot updates on next save

#### Steps

1. From SCN7's quote, change Site VN → India in Cpx header.
2. Save → reload → SnapshotPanel.

#### Expected

- "Site" field shows `India`.
- captured_at updates.
- Warnings: probably none yet (site changed before save, so snapshot rebuilt at new site).

#### Acceptance

- [ ] Site field shows new site value

---

### SCN9 — Copy quote via right-click → banner appears, badge switches Live rates

#### Steps

1. Quote History → right-click on `RFQ-UAT-SNAP-001` row → **Copy** (creates a draft, not saved yet).
2. Operator lands in Pricing (Std) editor with the copied state.

#### Expected

- **Blue banner** at top of Pricing Worksheet: "This is a COPY of …" (info tone, not error).
- SnapshotPanel badge = 🟡 **Live rates** (synthesized, amber).
- captured_at = `—`, captured_by = `—`.
- Cost numbers still display (resolved via live `lib.*`).

#### Acceptance

- [ ] Banner visible, badge amber, captured_at empty

---

### SCN10 — Copy + Save → badge flips to Frozen with new captured_at

#### Steps

1. From SCN9's copy, change Selling Price slightly (e.g. 0.50 → 0.52).
2. Save → name it `RFQ-UAT-SNAP-001-COPY`.
3. Reload, open, view SnapshotPanel.

#### Expected

- Banner gone (no longer copy — it's a real new quote now).
- Badge = 🟢 **Frozen**.
- captured_at = save time of the COPY save (NOT original SCN1 time).
- captured_by = current operator.

#### Acceptance

- [ ] Saved copy has fresh snapshot, distinct from original

---

### SCN11 — Original quote unchanged after copy + save

#### Steps

1. Open original `RFQ-UAT-SNAP-001` in a new tab.
2. Compare captured_at vs `RFQ-UAT-SNAP-001-COPY`.

#### Expected

- Original captured_at = SCN4's timestamp (unchanged by the copy).
- Copy has a NEWER captured_at.

#### Acceptance

- [ ] Original snapshot unaffected by copy operation

---

### SCN12 — Legacy quote (no snapshot) → heal-on-read marks synthesized

#### Steps

Prerequisite: an old quote from before Phase 1 (pre-2026-06-10). If none available, skip this scenario or have admin manually delete `state.pricing_snapshot` from a saved quote JSON via Settings → DB Backup → JSON Edit. **Coordinate with admin if needed.**

1. Open the legacy quote.
2. View SnapshotPanel.

#### Expected

- Badge = 🟡 **Live rates** (synthesized).
- captured_at + captured_by = `—`.
- Materials/Workcenters/Coverage counts populated (synthesized from current lib).
- Cost numbers display (calc still works).

#### Acceptance

- [ ] Legacy quote opens, snapshot shows synthesized, no crash

---

### SCN13 — Legacy quote save → flips synthesized → persisted

#### Steps

1. From SCN12, click Save (no other change needed).
2. Reload, open quote, SnapshotPanel.

#### Expected

- Badge now 🟢 **Frozen**.
- captured_at populated.

#### Acceptance

- [ ] Save converts synthesized → persisted

---

### SCN14 — Reload during active edit (unsaved changes) does NOT lose snapshot

#### Steps

1. From any Frozen quote, edit a field (do NOT save).
2. Press Cmd+R browser reload.

#### Expected

- Browser prompts "Leave?" (unsaved changes warning) — operator confirms reload.
- Quote re-opens with last saved snapshot (edit was discarded, expected).
- SnapshotPanel still shows Frozen + correct captured_at.

#### Acceptance

- [ ] Snapshot survives reload even with discarded edit

---

### SCN15 — SnapshotPanel keyboard accessibility

#### Steps

1. Tab to SnapshotPanel summary row.
2. Press Enter (or Space).

#### Expected

- Native `<details>` toggles open/close on Enter or Space.
- Focus ring visible per Sprint 10 P2-3 (tokens.css `:focus-visible`).

#### Acceptance

- [ ] Keyboard toggle works, focus ring visible

---

### SCN16 — Warning badge displays when result carries `_warnings`

Setup needs admin to inject `result._warnings`. **If SCN24 (admin scenario) seeds a site_mismatch warning first, this scenario can read it; otherwise skip and coordinate.**

#### Steps

1. Open a quote with `result._warnings` populated (e.g. site_mismatch).
2. View SnapshotPanel.

#### Expected

- Red **N warning(s)** badge next to the Frozen/Live rates badge in the summary row.
- Expand panel → Warnings section visible at the bottom with bullet list of messages.

#### Acceptance

- [ ] Warning badge + warnings list both render

---

### SCN17 — Cost Breakdown tab passes snapshot to all child calc renderers

#### Steps

1. Open any Frozen quote.
2. Switch between MOQ tabs (MOQ-1, MOQ-2, MOQ-3 if multi-tier).

#### Expected

- All tier numbers consistent with snapshot (no live-lib leakage).
- SnapshotPanel stays at bottom across tier switches.

#### Acceptance

- [ ] Multi-tier display uses snapshot rates uniformly

---

### SCN18 — Summarize tab → enable "Snapshot" column toggle

#### Steps

1. Cost → Cost Breakdown (Summarize tab).
2. Click Columns toggle (3-dot icon, right side).
3. Enable "Snapshot" checkbox.

#### Expected

- New column appears showing per-row badge: Frozen / Live rates / No snapshot.
- Color-coded (green / amber / gray).
- Mixed quotes' SPs show their per-SP snapshot state if applicable.

#### Acceptance

- [ ] Snapshot column renders correct per-row source

---

### SCN19 — Summarize filter still works with Snapshot column visible

#### Steps

1. From SCN18, type "UAT" in global search.

#### Expected

- Rows filter normally; Snapshot column does not break filter logic.

#### Acceptance

- [ ] Filter + Snapshot column coexist without bug

---

### SCN20 — Summarize CSV export includes (or excludes) snapshot column per visibility

#### Steps

1. With Snapshot column visible, select rows + CSV Export.
2. Open CSV in Excel.

#### Expected

- CSV contains a column with `Frozen / Live rates / No snapshot` text values.
- If Snapshot column hidden, CSV omits the column (Option B respect-visibility from PR #120).

#### Acceptance

- [ ] CSV respects column visibility

---

## Admin scenarios (SCN21–SCN30) · Kịch bản admin

### SCN21 — Site mismatch warning: snapshot frozen under VN, current site = India

#### Steps

1. Login as admin or sys.
2. Open `RFQ-UAT-SNAP-001` (frozen under VN per SCN1).
3. Header: change Site VN → India. **DO NOT save.**
4. Cost Breakdown → SnapshotPanel.

#### Expected

- Red **1 warning** badge appears in SnapshotPanel summary.
- Expand panel → Warnings section: "Site mismatch: snapshot frozen under 'VN', current state.site = 'India'".
- Cost numbers still display (resolved via snapshot).

#### Acceptance

- [ ] Warning surfaces in UI without save

---

### SCN22 — Site mismatch persists in xlsx export

#### Steps

1. From SCN21 (do NOT save the site change), Quote History → Export → variant `internal` / lang `en`.
2. Open exported xlsx → tab `10 Pricing Snapshot`.

#### Expected

- Row "Warnings" populated with site mismatch message (not `—`).

#### Acceptance

- [ ] Warning in exported xlsx audit sheet

---

### SCN23 — Save with site mismatch → snapshot rebuilds under new site, warning clears

#### Steps

1. From SCN21, click Save.
2. Reload, open, SnapshotPanel.

#### Expected

- Site field now `India`.
- captured_at updated.
- Warning badge gone (site no longer mismatches).

#### Acceptance

- [ ] Snapshot rebuild on save clears mismatch warning

---

### SCN24 — xlsx export `10 Pricing Snapshot` sheet — all 11 rows present

#### Steps

1. Export `RFQ-UAT-SNAP-001` as `internal` / `en`.
2. Open xlsx → tab `10 Pricing Snapshot`.

#### Expected

- Header row 2: `Field` / `Value`.
- 11 rows (3–13): Quote ID, Quote saved at, Pricing captured at, Pricing captured by, Site, Library version, Snapshot status, Materials frozen, Workcenters frozen, Coverage rows, Warnings.
- Snapshot status = `Frozen at save time`.
- Materials frozen = 1, Workcenters frozen = 1, Coverage rows > 0.
- Column widths readable (A=28, B=72 approx).

#### Acceptance

- [ ] All 11 rows correct, sheet visible (not hidden)

---

### SCN25 — Hidden `_Audit` sheet preserved (MVP-2 contract)

#### Steps

1. From SCN24's xlsx, right-click on sheet tab strip → Unhide.
2. Look for `_Audit` and `_Schema`.

#### Expected

- `_Audit` + `_Schema` both present, both hidden by default.
- `10 Pricing Snapshot` is VISIBLE (not in the hidden list).

#### Acceptance

- [ ] Hidden + visible sheets per Phase 4 contract

---

### SCN26 — Synthesized snapshot → xlsx status reads "Live rates"

#### Steps

1. Export a copied (un-resaved) quote from SCN9 (badge was Live rates).
   - Note: copy must be saved first to appear in Quote History. If copy was discarded, redo SCN9 + save it.
2. Tab `10 Pricing Snapshot` → row `Snapshot status`.

#### Expected

- Synthesized quotes: `Live rates (no snapshot persisted)`.
- Persisted: `Frozen at save time`.
- Empty: `No snapshot`.

#### Acceptance

- [ ] Status label matches snapshot source

---

### SCN27 — Library drift: mutate `lib.rate` after a save, reload old quote

⚠ **Destructive — back up `Library/` before this scenario.**

#### Steps

1. Backup: `cp -R server/data/Library server/data/Library.uat-backup`.
2. Admin: Library tab → edit a workcenter rate used by `RFQ-UAT-SNAP-001` (e.g. change Slit labor_rate from 3.08 → 5.00).
3. Save library.
4. Reload `RFQ-UAT-SNAP-001` from Quote History.
5. Compare Cost Breakdown numbers vs SCN1's verified values.

#### Expected

- Numbers IDENTICAL to SCN1 (snapshot resolver wins, library mutation does NOT leak in).
- SnapshotPanel: Library version field still shows OLD value (the version captured at SCN1 save time).

#### Acceptance

- [ ] Frozen quote shielded from library drift — KEY GO-LIVE CHECK

#### Cleanup · Dọn dẹp

```bash
rm -rf server/data/Library
mv server/data/Library.uat-backup server/data/Library
# Restart server to pick up restored library
```

---

### SCN28 — Library drift + Save → snapshot re-freezes to new lib version

#### Steps

1. With Slit labor_rate still at 5.00 (post-SCN27 mutation), open `RFQ-UAT-SNAP-001` again.
2. Save (no other change).
3. Reload, view SnapshotPanel + Cost Breakdown.

#### Expected

- captured_at updated.
- Cost numbers SHIFTED (now reflect labor_rate=5.00).
- Library version field shows NEW version (if library bump versioning is wired).

#### Acceptance

- [ ] Save under mutated lib captures new state correctly

#### Cleanup

Same as SCN27 cleanup.

---

### SCN29 — Prometheus metrics endpoint exposes snapshot counters

#### Steps

1. After running SCN1–SCN10, hit `http://localhost:3100/metrics`.
2. Search for `pricing_snapshot_*`.

#### Expected

- `pricing_snapshot_save_total{site="VN",source="persisted",type="standard"} ≥ 2`
- `pricing_snapshot_save_total{...,source="synthesized",...} ≥ 0` (if SCN10 copy save)
- `pricing_snapshot_synth_save_total{...} ≥ 0`
- `pricing_snapshot_warning_total{type="standard",warning="site_mismatch"} ≥ 1` (after SCN23)

#### Acceptance

- [ ] All 3 counter families present in /metrics output

---

### SCN30 — Legacy quote heal-on-read does not double-fire metrics

#### Steps

1. Take note of current `pricing_snapshot_save_total` value at /metrics.
2. Reload (do NOT save) the legacy quote from SCN12 multiple times.
3. Re-check /metrics.

#### Expected

- Counter UNCHANGED (heal-on-read does not write to DB, does not fire save counter).
- Save once → counter increments by exactly 1.

#### Acceptance

- [ ] Counter only fires on actual save, not on read/render

---

## Summary tally · Tổng kết

| Block          | Total | PASS | FAIL | Notes |
| -------------- | ----- | ---- | ---- | ----- |
| Operator (1–20)|   20  |      |      |       |
| Admin (21–30)  |   10  |      |      |       |
| **Total**      |   30  |      |      |       |

**Pass threshold for Phase 5 sign-off · Ngưỡng PASS để chốt Phase 5**: 28/30 (≥93%); any P0 FAIL → halt.
P1+ FAILs not gating but must have MES-3-FIX ticket filed before go-live D-0 (2026-07-21).

## Post-UAT actions · Sau UAT

1. Filed bugs → MES-3-FIX-XX (raise via gh issue or directly into CLAUDE.md backlog section).
2. If all 30 PASS → flip to admin-merge Phase 5 PR.
3. CLAUDE.md sprint-history entry for S-SNAPSHOT phases 1–4 (Phase 5 entry added at merge time).
4. Operator + admin docs (this PR) deployed to `client/public/help/` for in-app access.
