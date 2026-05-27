# Win EXE CLIENT Field-Test Checklist — D-7 (2026-06-02)

> Pre-UAT verification that the Win EXE CLIENT actually connects to the
> Mac DMG SERVER over LAN and runs the calculator end-to-end. Deferred
> from D-15 because the Win EXE was cross-compiled from Mac arm64 and
> needs at least 1 real Windows host smoke test before D-6 UAT kickoff.
>
> **Owner**: Lead Engineer (Đặng Thế Thiệp) + 1 Win operator volunteer.
> **Estimated time**: 30-45 min if green, +1-2h if any setup-wizard or
> calc bug surfaces (which is the whole point of running this early).
> **Output**: signed checklist + decision GO / NO-GO for D-6 UAT.

---

## Pre-conditions

| Item                  | Required state                                                    |
| --------------------- | ----------------------------------------------------------------- |
| Mac DMG SERVER 1.5.10 | Running on Lead's Mac, port 3100, LAN-reachable                   |
| Win EXE CLIENT 1.5.10 | Built + copied to USB stick or Zalo file share                    |
| SHA256 of EXE         | Recorded + posted to Zalo group "OpsControl GoLive 2026-06-09"    |
| 1 Windows host        | Win 10 or 11, x64, on same LAN as SERVER Mac                      |
| Volunteer operator    | Available for ~45 min, can follow English/Vietnamese prompts      |
| Operator account      | Provisioned per Sprint 1.5 flow with temp pwd + Provisioning Card |
| Network               | Win host can `ping <Mac SERVER IP>` successfully                  |

If ANY pre-condition fails → halt + resolve before running the field test.

---

## Pre-test prep (Lead does, evening D-8 or morning D-7)

- [ ] Re-confirm Win EXE SHA256 matches the Zalo post (download integrity check)
- [ ] Confirm Mac SERVER on port 3100 is reachable: from Lead's Mac browser
      navigate to `http://localhost:3100/health` → expect `{"ok":true,...}`
- [ ] From Win host pre-test: open Command Prompt → `ping <MAC_SERVER_IP>` →
      4 replies expected; if 0 replies → check Wi-Fi/Ethernet + Mac firewall
      (System Settings → Network → Firewall → Allow Ops Control incoming)
- [ ] Pre-stage 1-2 reference quotes in the Mac SERVER DB so the operator
      has something to load (use `RFQ-2026-S0013` or similar)
- [ ] Print this checklist or open it side-by-side with the Win host during
      the field test

---

## Test sequence — 8 phases

### Phase 1 — Install the EXE (5 min)

- [ ] Double-click `Ops Control CLIENT 1.5.10-x64.exe` (or whatever the
      NSIS installer is named)
- [ ] Windows SmartScreen banner appears: "Microsoft Defender SmartScreen
      prevented an unrecognized app from starting"
  - Click **More info** → **Run anyway**
  - This is expected because the EXE is ad-hoc signed (no Microsoft
    Authenticode cert — $300+/yr cost, deferred)
- [ ] NSIS installer runs:
  - Accept license agreement
  - Pick install location (default `C:\Program Files\Ops Control` OK)
  - Click **Install** → wait ~20 sec
  - Click **Finish** with "Launch Ops Control" checked
- [ ] App window opens to first-run setup wizard

**STOP if**: SmartScreen path is unfamiliar to operator → walk through
verbally; the "Run anyway" link is small and operators miss it. NOT a
bug — Windows working as designed.

### Phase 2 — First-run wizard (5 min)

The Win EXE was built with `build-role.json` = `client` so this should
auto-skip role detection and go straight to server URL config.

- [ ] **Step 1/2** — "Bước 1/2 — Địa chỉ server" panel appears (English-
      Vietnamese mix; that's the operator-facing UI)
  - **If you see "Lưu & tiếp tục" button instead** → this is the LEGACY
    first-run dialog (broken `fetch()` from `data:` URL → CORS block).
    Cancel + close app + delete BOTH `%APPDATA%\ops-control-desktop\setup-done.json`
    AND `%APPDATA%\ops-control-desktop\ops-control-config.json` → relaunch →
    should now show v1.3 wizard
- [ ] Type Mac SERVER LAN URL in the input box:
      `http://<MAC_SERVER_IP>:3100` (e.g. `http://10.102.3.61:3100`)
  - **Verify URL format**: `http://` prefix + colon + port (NOT a dot —
    `:3100` not `.3100`)
- [ ] Click **Test connection**
  - Expected: green checkmark + "Server v1.5.10 phản hồi OK" message
  - **If "Failed to fetch"** → check: Mac SERVER actually running on
    3100 (`lsof -nP -iTCP:3100 -sTCP:LISTEN` on Mac shows a node PID),
    Win host can ping Mac IP, Mac firewall allows incoming on 3100
- [ ] Click **Next** → wizard closes → login screen appears

### Phase 3 — License activation (5-10 min)

- [ ] On login screen: orange/red **License Invalid** banner at top
- [ ] Click banner → modal opens showing **Installation ID** (~140-char
      base64 string)
- [ ] Click **Copy** to clipboard
- [ ] Paste Installation ID into Zalo + send to Lead Engineer with
      subject `LICENSE REQUEST — Win <hostname> <date>`
- [ ] Lead generates license:

  ```bash
  # On Lead's Mac
  cd "3. PROJECTS/Ops Control v1.2"
  node scripts/license/generate-license.mjs \
    --installation-id "<paste full ID>" \
    --customer "CCL Vietnam Yen Phong" \
    --expires 2027-06-09
  ```

  Copy the `.lic` output blob back to operator via Zalo.

- [ ] Operator pastes `.lic` into **Activation Key** field → click **Activate**
- [ ] License banner disappears → can now log in

**STOP if**: License generation fails on Lead's Mac → check `dev-private.pem`
exists at `scripts/license/dev-private.pem`. **STOP if**: license accepted
in modal but banner persists → check that `OPS_LICENSE_PUBKEY` in Mac
SERVER's `.env` matches `dev-public.pem` (Sprint S-D15 incident — Mac DMG
shipped with the pubkey missing, fixed at build time).

### Phase 4 — Login + TOTP enrollment (5 min)

- [ ] Username: operator's username (per HR list)
- [ ] Password: temp pwd from Provisioning Card (paper card given during prep)
- [ ] Click **Login**
- [ ] First-login TOTP enrollment dialog appears with QR code
  - Operator opens Microsoft Authenticator (or Google Authenticator) on
    their phone → tap **+** → **Scan a QR code** → point at screen
  - Authenticator shows 6-digit code rotating every 30 sec
  - Operator types current 6-digit code into Ops Control TOTP field →
    click **Verify**
- [ ] **must_change_password** flow kicks in: operator types new password
      (min 12 chars per Sprint 1.5 enforcement) → confirm → submit
- [ ] App lands on Home page (greeting + 4 KPIs + recent activity)

**STOP if**: TOTP "Invalid code" → check Mac SERVER + Win host clocks
both synced (Win: `w32tm /resync`; Mac: `sudo sntp -sS time.apple.com`).
TOTP tolerates ±30 sec drift; >60 sec drift = invalid every time.

### Phase 5 — Cost calculator smoke test (10 min)

- [ ] Click sidebar **Cost → Standard**
  - All 10 sub-tabs visible: RFQ & MOQ Info / Layout / Materials / Inks /
    Processes / Balancing / Pack & Ship / Cost Breakdown / Summarize / Legend
  - No "Cost → \<tab\> crashed" red banners
- [ ] Click **Quote History** in sidebar → table loads with ≥1 row
- [ ] Click row → row context menu → **Open** → Standard tab loads with
      the saved quote populated
- [ ] Verify top KPI strip math (post FIX-47):
  - `TTL.MAT + PROCESS + TOOLING + PACK&SHIP` should ≈ `SUBTOTAL`
    (no double-count, no missing setup cluster)
  - Sum invariant holds within ±0.001 for typical quotes
- [ ] Modify any input (e.g. change Sell Price by $0.01) → re-saves OK
      → reload quote → modified value persists

### Phase 6 — CSV export (5 min)

Per PR #90 native Save dialog + row selection.

- [ ] Click sidebar **Cost Breakdown** (Summarize tab)
- [ ] Verify checkbox column on left + button label `CSV Export (N)` where
      N = visible row count
- [ ] Check 3 rows → button label updates to `CSV Export (3)` + hint row
      below header reads `3 row(s) selected — only those will be exported`
- [ ] Click **CSV Export (3)** → native Windows Save dialog appears
- [ ] Save to `Desktop\` with default filename → click Save
- [ ] Open the .csv file in Excel
  - 3 data rows + 1 header row
  - Production Size column shows `220×395` correctly (UTF-8 `×` not
    `√ó`)
  - No `size` column (dropped in PR #90 cleanup)
  - Description fields with embedded `"` or `,` parse cleanly (no
    broken rows)

### Phase 7 — Ink-tab calc verification (5-10 min)

Per PR #87 + FIX-46 — Inks tab with Indigo subtypes.

- [ ] Create new Standard quote → fill RFQ + Layout
- [ ] In Inks tab, add a row → set Print Type = **Indigo(Primer)**
- [ ] **COV OVR cell** should show `400` in italic gray (Auto state from
      Coverage Table lookup) — NOT blank, NOT click-charges path
- [ ] Type override `250` → cell turns violet bold + Reset (↻) icon
      appears to the right
- [ ] Click **↻** → cell reverts to `400` italic gray
- [ ] Change Print Type to **LP** → COV OVR shows `—` (LP not in
      Coverage Table, fallback)

### Phase 8 — Logout + close (2 min)

- [ ] Click sidebar **SYSTEM → My Profile → Logout**
- [ ] Login screen reappears
- [ ] Close app via X → no crash dialog
- [ ] Relaunch app → resumes at login screen (server URL preserved in
      electron-store)

---

## Verdict + sign-off

**Overall result** (check one):

- [ ] **PASS** — all 8 phases green. Win EXE ready for D-6 UAT distribution.
- [ ] **PARTIAL** — phases 1-N pass, phase \<X\> failed. Specific issue:
      `__________________________________________________________`
      → triage with Lead before deciding GO / NO-GO for D-6.
- [ ] **FAIL** — blocker issue on phase \<X\>. Recovery plan:
      `__________________________________________________________`
      → consider Mac-only first go-live + Win EXE pushed to D+1..D+7 patch.

**Tested by**:

- Operator: `__________________` Win host: `__________________` Date: `____________`
- Lead Engineer: `__________________` Date: `____________`

---

## Known-acceptable behaviors

These look like bugs but are intentional or out-of-scope for v1.5.10:

1. **Windows SmartScreen "unrecognized app"** — expected (ad-hoc signed).
   Future v1.6 may pursue Authenticode cert.
2. **Cost Breakdown CSV missing `size` column** — intentional per PR #90
   (duplicate of `production_size`). If operator misses it → tell them
   "the Production Size column is what they want".
3. **Slow first launch (~5-8 sec)** — Electron renderer + embedded
   server startup. Subsequent launches faster (~2-3 sec).
4. **"Session expired" if Win host time drifts >60 sec from Mac** — TOTP
   strict-equality on time window. Resync clocks.

---

## Post-test artifacts

After PASS, attach to D-7 verification record:

- [ ] Photo or screen-record of all 8 phases passing
- [ ] Copy of the exported `.csv` file (verify UTF-8 BOM with `file --mime`
      → should say `text/csv; charset=utf-8`)
- [ ] Win EXE SHA256 logged in the cutover ledger
- [ ] Update `docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md` State-snapshot
      table — flip "Win EXE CLIENT" row from `⚠️ FIELD TEST PENDING` to
      `✅ DONE`

---

## Failure escalation

If Phase 1-4 fails (install / setup wizard / license / login):

- Likely cause: Electron / native-module / build artifact issue
- Escalate to Lead Engineer immediately
- Lead may need to rebuild Win EXE from a fresh `git pull origin main`
  - `node scripts/build-windows-installers.mjs client`

If Phase 5-7 fails (calculator math / Inks tab / CSV):

- Likely cause: calcEngine regression OR data-shape drift on operator's
  test quote
- Capture: screenshot of math discrepancy + the quote_id being tested
- Re-run the same test sequence on Mac DMG SERVER directly (same quote,
  same inputs) — if Mac SERVER passes, the bug is in Win shell layer; if
  Mac SERVER also fails, calcEngine regression (rare — would have been
  caught by `npm test` 843-test suite)

If Phase 8 fails (logout / restart):

- Likely cause: electron-store config corruption
- Workaround: delete `%APPDATA%\ops-control-desktop\ops-control-config.json`
- Re-do Phase 2-4

---

## Companion files

- `docs/cutover/MAC_INSTALL_GUIDE.md` — Mac install/upgrade flow (mirror reference)
- `docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md` — Hương standby scope
- `docs/cutover/STOP_TRIGGERS_2026-06-09.md` — 11 halt criteria
- `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` — D-7 work block context
- `docs/cutover/PROMPTS/PROMPT_WIN_EXE_BUILD_2026-05-25.md` — Win EXE build runbook (engineer-side)

---

**Document version**: 1.0 (created 2026-05-26 D-14)
**Owner**: Lead Engineer (Đặng Thế Thiệp)
**Audience**: 1 Win operator volunteer + Lead Engineer joint session
**Execution window**: D-7 (2026-06-02, Tuesday) AM or PM ICT
**Status**: PENDING — to be executed
