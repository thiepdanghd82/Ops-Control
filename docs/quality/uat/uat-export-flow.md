# UAT — Quote Export Flow

Sprint: S-EXPORT-UAT · Owner: Đặng Thế Thiệp · Reviewer: thiepdanghd82
Scope: end-to-end operator validation on prod hardware
Surfaces in scope: Quote History download icon → modal → POST /api/quotes/:id/export → browser download → file inspection on 3 OS families + 1 mobile + 2 spreadsheet apps

## How to use this checklist

Each scenario has 4 fields the operator fills in real time:

- **Steps** — exact click path; assume cold browser session
- **Expected** — what the UI / file should do
- **Acceptance** — Pass / Fail binary; partial-pass = Fail with notes
- **Screenshot placeholder** — embed via `![](screenshots/SCN<n>-<step>.png)` after capture

If a scenario fails, fill the bug stub at the end of that scenario. Don't try to fix during UAT — collect, triage at the end.

### Execution order (NOT document order)

- **SCN5 runs FIRST** as a pre-flight engineer task. If FAIL, halt and run the HMAC recovery playbook before operator starts SCN1.
- **SCN1-4** runs in document order by operator.
- **SCN6-8** runs after SCN1-4 PASS (edge cases + customer-share readiness).

Document order kept as SCN1 → SCN8 for readability (operator scenarios grouped first); execution sequence is `SCN5 → SCN1 → SCN2 → SCN3 → SCN4 → SCN6 → SCN7 → SCN8`.

### Screenshot anonymisation rule (per risk-register R4)

Trước khi commit screenshot vào `screenshots/` folder:

- **CROP** vùng có customer name, PO number, total amount, tier pricing
- Nếu không crop được sạch → ghi mô tả text, KHÔNG attach screenshot
- Cover sheet screenshots: ưu tiên crop ra vùng "CUSTOMER COPY" watermark + sheet structure, BỎ vùng KPI numbers
- Watermark screenshots (SCN4): crop xung quanh AA1 cell, không cần show full sheet

Operator self-check trước commit: "Nếu screenshot này leak ra ngoài, customer có nhận ra quote của họ không?" Nếu YES → re-crop hoặc thay bằng text description.

### Bug stub format

Copy under any failing scenario:

```
### Bug — SCN<n>: <short title>
- Severity: P0 blocker / P1 fix-before-customer-send / P2 MVP-2.1 / P3 defer-MVP-3
- Surface: <browser/OS/spreadsheet app + version>
- Quote reference: #1 / #2 / #3 / #4 / #5 (per test-quotes.md slot numbering — DO NOT paste raw QT-ID)
- Reproduce: <step-by-step from current quote state — anonymise customer name + PO + pricing>
- Expected vs actual: <one line each — no real numbers, use "TIER-N value" or "~$X-range">
- Workaround for the customer demo (if any):
- Filed as: MVP-2.1-FIX-<n> (raise after UAT)
- Screenshots: cropped to exclude customer name/PO/pricing per R4 mitigation
```

**Triage mapping** (sau UAT, decision-maker triage theo): P0 → halt + review trước · P1 → fix-before-customer-send · P2 → fix-MVP-2.1 · P3 → defer-MVP-3 · No-repro hoặc out-of-scope → wontfix

---

## SCN1 — Export single quote (Std variant, default settings)

Smoke baseline. If this fails, halt UAT and triage.

### Steps

1. Login to prod with **operator's real account** (NOT `demo` — UAT phải test access gating end-to-end, demo account bypass một số check)
2. Navigate Cost → Quoting → Quote History
3. Locate test quote #1 (per [test-quotes.md](test-quotes.md); should be a single-tier Std quote)
4. Click the download icon (⬇) in the row's Actions cell
5. In the modal: leave defaults (`Internal copy` / `EN + VI` / single-tier auto-summary)
6. Click `Export`

### Expected

- Modal closes; browser triggers a file save
- Filename matches `Quote_<rfq>_<customer>_MOQ<n>_internal_v<ver>_<YYYYMMDD>.xlsx`
- Toast / alert shows `Downloaded <filename>`
- File size 80-300 KB (single-tier Std)
- Open in Excel (Mac) — 10 sheets visible: Cover, RFQ/MOQ, Layout, Materials, Inks, Processes, Balancing, Pack&Ship, Cost Breakdown, Summary
- `_Audit` + `_Schema` sheets NOT visible in the tab strip
- KPI numbers on Cover + Summary match what Quote History row shows (SP, GM%, VA%, Contr%)

### Acceptance

- [ ] Pass
- [ ] Fail (fill bug stub below)

### Screenshot

- `screenshots/SCN1-modal-default.png`
- `screenshots/SCN1-excel-cover.png`
- `screenshots/SCN1-excel-summary.png`

---

## SCN2 — Export after filtering Quote History by date range

Verifies the modal trigger still works after the operator narrows the visible list. Note: there is NO server-side date-range filter on the export endpoint itself — this scenario is "can the operator find a quote via filter, then export". The export wire is unchanged.

### Steps

1. Quote History → search box: type partial customer name OR set status filter
2. Confirm the row count drops to <10
3. Click ⬇ on a row in the filtered list
4. Export with default settings

### Expected

- Filter state preserved while modal opens
- Export downloads same way as SCN1 (filter is presentational only)
- After download, filter still applied to the visible list (no full reload)

### Acceptance

- [ ] Pass
- [ ] Fail (fill bug stub)

### Screenshot

- `screenshots/SCN2-filtered-list.png`
- `screenshots/SCN2-post-export.png`

---

## SCN3 — Sheet-protection UX cross-platform

**Important framing**: the file does NOT prompt for a password to OPEN — ExcelJS's MVP-2 protection is per-sheet XOR (edit-blocking only). The random per-export password is irrecoverable in prod (only the sha256 hash is logged) so the operator has NO way to unprotect. Cross-platform question is really: "does the file open cleanly?" + "does the edit-lock display consistently?".

### Steps (Mac with Excel)

1. Open SCN1's xlsx via Finder double-click (Excel for Mac, ≥ 16.x)
2. Confirm: file opens immediately, NO password prompt, NO "Protected View" yellow banner
3. Click any cell on a visible sheet → try to type a value
4. Expected: Excel pops a small dialog "The cell or chart you're trying to change is on a protected sheet"
5. Cancel the dialog; right-click a sheet tab → confirm `Unprotect Sheet…` is enabled but useless (random password not known)

### Steps (Windows with Excel)

Repeat steps 1-5 on a Windows machine (Excel 365 / 2021)

### Steps (LibreOffice on Linux or Mac)

1. Open the same xlsx in LibreOffice Calc ≥ 7.6
2. Confirm: file opens without prompt
3. Try editing any cell → LibreOffice should show "This document is protected" warning or simply ignore the keypress
4. Tools → Protect Sheet → confirm matches Excel behaviour (locked)

### Expected

All three platforms: file opens, edits silently blocked, no scary warnings. Differences in the exact wording of the edit-blocked dialog are OK; what matters is no false-positive virus / corruption flag.

### Acceptance

- [ ] Mac Excel — pass
- [ ] Windows Excel — pass
- [ ] LibreOffice — pass
- [ ] Any platform fails (fill bug stub)

### Screenshot

- `screenshots/SCN3-mac-open.png`
- `screenshots/SCN3-mac-edit-blocked.png`
- `screenshots/SCN3-win-open.png`
- `screenshots/SCN3-libreoffice-open.png`

---

## SCN4 — Customer-variant watermark fidelity

Per MVP-2 Item E: customer variant stamps `CUSTOMER COPY` at cell AA1 (col 27) on every visible sheet with ARGB fill `FFF5E0E0` (pink-grey) + dark-red bold italic text. Cross-renderer fidelity check.

### Steps

1. Export the same test quote as SCN1 but pick `Customer copy` variant
2. Open in Excel (Mac) — locate AA1 on Cover sheet; verify visible
3. Lặp lại trên TẤT CẢ 10 visible sheets: Cover, RFQ/MOQ, Layout, Materials, Inks, Processes, Balancing, Pack&Ship, Cost Breakdown, Summary — watermark present ở AA1 mỗi sheet
4. Confirm `_Audit` + `_Schema` (hidden sheets) do NOT have the watermark (operator: unhide via Format → Sheet → Unhide, check, then re-hide)
5. Open same file in LibreOffice Calc — re-verify AA1 watermark across sheets
6. AirDrop file to iPhone → open in Numbers iOS — re-verify

### Expected

- AA1 cell visible with `CUSTOMER COPY` text
- Pink-grey fill renders as a pinkish pastel (exact ARGB drift OK, semantic colour preserved)
- Text dark-red, bold, italic
- Watermark on every visible sheet (10 total)
- No watermark on `_Audit` / `_Schema`

### Acceptance

- [ ] Excel — fidelity acceptable (10/10 sheets có watermark AA1)
- [ ] LibreOffice — fidelity acceptable (10/10 sheets có watermark AA1)
- [ ] Numbers iOS — fidelity acceptable (Numbers may flatten styling — document any drift)
- [ ] Hidden sheets (`_Audit` + `_Schema`) confirmed NO watermark
- [ ] Fail (fill bug stub)

### Screenshot

- `screenshots/SCN4-excel-cover-watermark.png`
- `screenshots/SCN4-libreoffice-cover-watermark.png`
- `screenshots/SCN4-numbers-cover-watermark.png`
- `screenshots/SCN4-hidden-sheets-no-watermark.png`

---

## SCN5 — HMAC verify on prod env key (server-admin pre-flight)

**Not operator-facing. RUN AS PRE-FLIGHT BEFORE operator starts SCN1.** Verifies that a file signed by the prod server can be round-tripped through `verify.js` using the same prod `OPS_EXPORT_HMAC_KEY`. Run from a server shell with key access.

If SCN5 FAILS, halt UAT and run the HMAC recovery playbook (CLAUDE.md section "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle") before operator starts any other scenario.

### Steps

1. SSH to prod server
2. **Engineer**: trigger 1 throwaway export (any quote, internal variant, default settings) from operator account TRƯỚC khi operator bắt đầu SCN1. Save file về `/tmp/scn5-preflight.xlsx`. (Hoặc nếu SCN1 đã chạy rồi với engineer-on-call standing by, dùng SCN1 output — nhưng preferred order là throwaway export riêng.)
3. Run:
   ```bash
   cd /opt/ops-control
   node -e "
     import('./server/services/quoteExport/verify.js').then(async (mod) => {
       const fs = await import('node:fs');
       const buf = fs.readFileSync('/tmp/scn5-preflight.xlsx');
       const r = await mod.verifyExport(buf, process.env.OPS_EXPORT_HMAC_KEY);
       console.log('OK:', { audit: r.audit.quote_id, schemaSha: r.manifest.sha256.slice(0,8) });
     }).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
   "
   ```
4. Repeat with the key flipped to a random 64-hex string — should print `FAIL: HMAC verification failed`
5. Capture HMAC fingerprint per risk-register R3 mit#2: `node -e "console.log(require('crypto').createHash('sha256').update(process.env.OPS_EXPORT_HMAC_KEY).digest('hex').slice(0,8))"` → log into post-UAT summary as `HMAC-FP: <8 hex chars>`

### Expected

- Step 3 prints `OK: { audit: <id>, schemaSha: <8-char> }`
- Step 4 prints `FAIL` (proves tamper detection works against wrong key)
- Step 5 captures 8-char fingerprint successfully

### Acceptance

- [ ] Pass — proceed to operator-led SCN1
- [ ] Fail (fill bug stub — likely a deploy-time `.env` merge issue per Sprint 11 P2-1) — HALT UAT, run recovery playbook

### Screenshot

- N/A — terminal output captured to `screenshots/SCN5-terminal.txt`

---

## SCN6 — File-size edge case (large complex quote)

Pick the largest Cpx quote available (most sub-products × most ink/process rows × most tiers). Export `internal` variant with `all tiers` to surface the worst case.

### Steps

1. From [test-quotes.md](test-quotes.md), pick test quote #5 (the deliberately-large one)
2. Export `internal` / `bilingual` / `all tiers`
3. Observe: modal "Exporting…" duration (stopwatch)
4. Note returned file size
5. Open in Excel; navigate every visible sheet
6. Confirm no truncation, no #REF errors, all per-row Setup/Run/Total cells rendered

### Expected

- Export completes in ≤ 10 s (90% target ≤ 5 s)
- Zip file size ≤ 5 MB for the worst case the operator can realistically produce
- All sheets render cleanly without lag

### Acceptance

- [ ] Export time ≤ 10s (note actual: \_\_\_ s)
- [ ] File size ≤ 5 MB (note actual: \_\_\_ MB)
- [ ] All sheets render no #REF, no truncation
- [ ] Fail (fill bug stub; capture file size + tier count)

### Screenshot

- `screenshots/SCN6-modal-progress.png`
- `screenshots/SCN6-zip-size.png`
- `screenshots/SCN6-largest-sheet.png`

---

## SCN7 — Open on iPhone / iPad (Numbers)

Critical for the customer-share flow if the customer is on mobile. Numbers iOS has historically flattened some Excel styling — we want to know what survives.

### Steps

1. Use SCN1's `customer` variant xlsx (NOT zip — Numbers iOS extraction story is messier)
2. AirDrop / email to iPhone or iPad
3. Open in Numbers iOS
4. Inspect: Cover, RFQ/MOQ, Cost Breakdown, Summary
5. Try scrolling sideways to AA1 on Cover — verify watermark visible
6. Try tapping a cell — verify Numbers shows it as read-only (sheet protection should carry through)

### Expected

- File opens (no "format unsupported" error)
- All 10 visible sheets present in Numbers' sheet picker
- Numbers may down-render fancy fills (pink-grey watermark cell) — acceptable if the text "CUSTOMER COPY" is still legible
- Cells appear read-only

### Acceptance

- [ ] Opens cleanly
- [ ] Watermark text visible
- [ ] Numbers fidelity acceptable (any drift documented)
- [ ] Fail (fill bug stub)

### Screenshot

- `screenshots/SCN7-numbers-cover.png`
- `screenshots/SCN7-numbers-summary.png`
- `screenshots/SCN7-numbers-watermark.png`

---

## SCN8 — Multi-tier export (variant × language × tier matrix)

Verifies the zip-bundling path + that filename / Content-Disposition / X-Ops-Export-Format headers are correct for the multi-tier case. Also exercises every modal control.

### Steps

1. Pick a quote with ≥ 3 MOQ tiers (test quote #4 from [test-quotes.md](test-quotes.md))
2. Run 6 exports back-to-back, varying:
   - `customer` × `en` × `all`
   - `customer` × `vi` × `all`
   - `customer` × `bilingual` × `all`
   - `internal` × `bilingual` × `tier 0+2` (two-of-three subset)
   - `internal` × `bilingual` × `tier 0` (single-tier-from-multi-tier quote — should still return single xlsx not zip)
   - `internal` × `bilingual` × `tier 1+2` (subset excluding tier 0)
3. For each download, note filename + size
4. Unzip the `all tiers` archives → confirm one xlsx per tier with correct MOQ-N suffix

### Expected

- Single-tier selection → single `.xlsx` download
- Multi-tier selection → single `.zip` download
- Filename pattern preserved across variant + language + tier combos
- Inside zip: filenames match `Quote_<rfq>_<customer>_MOQ<n>_<variant>_v<ver>_<YYYYMMDD>.xlsx`, one per requested tier
- Each xlsx in the zip is a fully-formed 10-sheet workbook (not a stub)
- Watermark + sheet-protection apply per the variant

### Acceptance

- [ ] All 6 combos pass
- [ ] Filename pattern correct in every case
- [ ] Zip contents complete + correct
- [ ] Fail (fill bug stub per failing combo)

### Screenshot

- `screenshots/SCN8-modal-tier-subset.png`
- `screenshots/SCN8-zip-contents.png`
- `screenshots/SCN8-bilingual-cover.png`
