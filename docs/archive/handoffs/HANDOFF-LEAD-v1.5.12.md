# HANDOFF — Mac DMG SERVER v1.5.12 → Lead

**Date built:** 2026-05-29
**Tag:** `v1.5.12` (commit `30db7d2`)
**Artifact:** `desktop/dist-electron/Ops Control SERVER 1.5.12-arm64.dmg`
**Size:** 210 MB
**SHA256:** `b2d540cf2de920f5c9ce51f5c19ccb4de3a00879e14a02af6ec12ea4bef1e303`

## What changed since v1.5.11

| PR  | Commit    | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #96 | `57ea3d8` | **Hotfix:** Std → Processes Tool Cost / Speed / Tool Life now accept decimal input mid-typing. PR #95's `parseLocaleNumber` swap fixed the COMMIT path but not the typing trap — `parseLocaleNumber("12.")` returned `12`, state stored `12`, input re-rendered to `"12"`, trailing dot disappeared before operator could type the next digit. Swapped 3 raw `<input>` to `<DecimalInput>` (existing component, already used by ComplexCalc SubProductRow for the same fields). |
| #97 | `30db7d2` | Version bump `1.5.11 → 1.5.12` + CHANGELOG.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Smoke verification (done locally)

- ✅ PR #96 fix operator-verified on Mac DMG hardware 2026-05-29 (screenshot showed `12.25` typed cleanly in Tool Cost field)
- ✅ DMG built clean via `node scripts/build-mac-installers.mjs server`
- ✅ Lesson 28 better-sqlite3 binary parity: SHA256 `e8c5e5e4b5b2b8fec4eeaf3ca18df78d40271bde738ec57faddb19bcedda5eb1` matches at both `app/node_modules/.../better_sqlite3.node` AND `app.asar.unpacked/.../better_sqlite3.node`
- ✅ Native overlay preflight clean: `better-sqlite3`, `node-hid`, `@serialport/bindings-cpp` all overlaid
- ✅ 871 client tests pass

## Hardware test ask (delta vs v1.5.11)

Mount + install (replaces existing 1.5.11 if present):

1. Mount `Ops Control SERVER 1.5.12-arm64.dmg`, drag to `/Applications`
2. First launch — Gatekeeper "Open Anyway" if prompted
3. Login as sys or admin
4. **Verify version stamp:** Settings → About → must show `v1.5.12`
5. **Verify Tool Cost decimal:** Std → New Quote → Processes tab → Tool Cost → type `12.25` → must display `12.25` (was already verified on dev DMG; this is the regression confirm on tagged release)
6. **Verify Speed decimal:** same Processes tab → Speed column → type `100.5` → must accept
7. **Verify Tool Life decimal:** same row → type `200000.5` → must accept (or integer also OK, but `.` must not be stripped mid-typing)
8. **Regression check:** all v1.5.11 verifies still green (banner / About card / Summarize / VN-locale `12,5` on Tool Cost still works on blur)

## Predecessor

- v1.5.11 (SHA256 `9116bcb05ee9c6ee253b6d82e568f14dab742eed7ed0dec329821b95190b22bf`) is now superseded. Operators on v1.5.11 will see the version banner since server is now 1.5.12.

## Known pre-existing CI red (not blocking)

Same baseline as prior 9 admin-merged PRs in D-15 sprint:

- Lint: 5 pre-existing errors on `main` (unrelated to this change)
- Server test: `per-entry ETIMEDOUT is isolated` flake (pre-existing per CLAUDE.md S-EXPORT-MVP-2 note)

## Open follow-ups

- Licenses registry PR (`docs/operations/licenses/`) — operator license for mpham Win box currently on local stash, will resume after this hotfix is acknowledged.
- Win EXE build — repo has no GHA workflow for Windows artifacts; needs either manual Win-host build or new workflow before D-7.
- Pre-existing lint + flaky test cleanup PR (post-go-live).

— Generated 2026-05-29 14:30 ICT from `main` @ `30db7d2` (SERVER DMG ship)

---

## CLIENT DMG Added — 2026-05-29 16:10 ICT (post-verification gate)

Closes the CLIENT-missing HALT from initial verify report.

- **File:** `desktop/dist-electron/Ops Control CLIENT 1.5.12-arm64.dmg`
- **Size:** 210 MB
- **SHA256:** `88c138729c1f029f86a057e3ec66beedce30030a465e18730a40ec238e9e157b`
- **Build command:** `node scripts/build-mac-installers.mjs client`
- **Verification:** 7/7 programmatic checks PASS — see `desktop/dist-electron/VERIFY-REPORT-v1.5.12.md` CLIENT section
- **build-role.json:** `{"role": "client"}` — defaults to thin mode + first-run wizard for SERVER URL
- **Native parity:** better-sqlite3 SHA `e8c5e5e4…` identical to SERVER (same compiled binary, only role file differs between artifacts)

## Distribution checklist cho D-7

- [ ] **Henry** smoke SERVER trên Lead's Mac per `desktop/dist-electron/SMOKE-CHECKLIST-v1.5.12.md` (14 steps, ~15 min)
- [ ] **Henry** verify SERVER `/health` returns `version: 1.5.12` từ browser
- [ ] **Henry** gửi CLIENT DMG cho 6 operator qua Zalo channel (kèm SHA256 cho cross-verify)
- [ ] **Henry** distribute `SMOKE-CHECKLIST-CLIENT-v1.5.12.md` qua Zalo (operator-facing instructions tiếng Việt)
- [ ] **Henry** confirm Lead's SERVER LAN IP với 6 operator (cần thiết cho first-run config)
- [ ] **6 operators** install + smoke CLIENT (~10 min mỗi người, 22 steps)
- [ ] **Henry** track install completion từng operator qua Zalo
- [ ] **D-7 morning (2026-06-02)** confirm 6/6 operator CLIENT 1.5.12 ready → kick off field test scenarios

## File summary cho ship

| Artifact                              | SHA256 (first 8) | Target                 | Size   |
| ------------------------------------- | ---------------- | ---------------------- | ------ |
| `Ops Control SERVER 1.5.12-arm64.dmg` | `b2d540cf`       | Lead's Mac (1 install) | 210 MB |
| `Ops Control CLIENT 1.5.12-arm64.dmg` | `88c13872`       | 6 operator Macs        | 210 MB |

⚠️ **DON'T cross-install.** SHA mismatch = wrong DMG cho machine.

— CLIENT section appended 2026-05-29 16:10 ICT

---

## Win EXE Added — 2026-05-29 16:30 ICT (post-Mac-verification)

Closes Win parallel test gap for D-7 (2026-06-02).

### Build path

- **Chosen:** Local Mac cross-compile (Path M variant)
- **NOT** new GHA workflow (would have cost ~95min vs ~15min cross-compile)
- **Reasoning:** Investigation revealed (a) build pipeline `scripts/build-windows-installers.mjs` already complete + proven, (b) cross-compile from Mac arm64 → Win NSIS was already validated at v1.5.10 (`latest.yml` evidence May 27), (c) native modules use prebuilds (no Wine / MSBuild needed on Mac).

### Artifacts

| File                                  | Size   | SHA256                                                             | Target                                        |
| ------------------------------------- | ------ | ------------------------------------------------------------------ | --------------------------------------------- |
| `Ops Control SERVER Setup 1.5.12.exe` | 193 MB | `493882348b362fe8531dc96e47dc611e233fa09427e6090207cc70442503f0c0` | Win SERVER (optional, deferred unless needed) |
| `Ops Control CLIENT Setup 1.5.12.exe` | 193 MB | `13bacdf047ed6c93fdf11969639fd7efdb62614e6ffb2be961e5948f2aa5dfeb` | Win operator boxes (D-7 parallel test)        |

### Verification (7/7 PASS)

- File integrity: PE32 NSIS self-extracting archive ✅
- Asar-embedded version: `1.5.12` ✅
- build-role.json: SERVER → `{"role":"server"}`, CLIENT → `{"role":"client"}` ✅
- Native modules + Lesson 28 dual-overlay: better-sqlite3 Win x64 SHA `b52f64ed…` parity confirmed ✅
- Native prebuilds: node-hid + @serialport/bindings-cpp + argon2 all have Win x64 binaries ✅
- Ad-hoc signed (no Authenticode cert — operator clicks "Run anyway" on SmartScreen) ℹ️ expected
- Build evidence: see `desktop/dist-electron/WIN-BUILD-INVESTIGATION.md`

### Distribution cho D-7 Win parallel test

- [ ] **Henry/Lead** smoke Mac SERVER first (already in distribution checklist above)
- [ ] **Henry/Lead** distribute `Ops Control CLIENT Setup 1.5.12.exe` cho Win operator qua Zalo (kèm SHA256 cho cross-verify)
- [ ] **Henry/Lead** distribute `SMOKE-CHECKLIST-WIN-v1.5.12.md` cho Win operator (27 steps, bilingual)
- [ ] **Henry/Lead** confirm SERVER LAN IP với Win operator (cùng IP như Mac CLIENT operators)
- [ ] **Win operator** install + smoke (~15 min)
- [ ] **Lead** track install completion (D-7 morning gate)

### ⚠️ SHA stability note

Win EXE SHA changes per build run (NSIS embeds build timestamp). Above SHAs are authoritative for the artifacts on disk NOW. Any rebuild requires SHA recompute + Zalo broadcast update before distribution.

### ⚠️ Smoke notes

- Win SmartScreen warns "unrecognized app" on first launch (ad-hoc signed, no Authenticode $300/yr cert) → step 6 of smoke checklist documents "More info → Run anyway" path
- Operator install path: `C:\Users\<user>\AppData\Local\Programs\Ops Control` (per-user NSIS, no admin needed)
- First-run wizard auto-routes to "Server URL" prompt because CLIENT `build-role.json = {"role":"client"}`

## Updated file summary cho D-7 ship

| Artifact                              | SHA (first 8) | Platform  | Target                       | Size   |
| ------------------------------------- | ------------- | --------- | ---------------------------- | ------ |
| `Ops Control SERVER 1.5.12-arm64.dmg` | `b2d540cf`    | Mac arm64 | Lead's Mac (1 install)       | 210 MB |
| `Ops Control CLIENT 1.5.12-arm64.dmg` | `88c13872`    | Mac arm64 | 6 Mac operators              | 210 MB |
| `Ops Control SERVER Setup 1.5.12.exe` | `49388234`    | Win x64   | Win SERVER (optional)        | 193 MB |
| `Ops Control CLIENT Setup 1.5.12.exe` | `13bacdf0`    | Win x64   | Win operator(s) D-7 parallel | 193 MB |

— Win section appended 2026-05-29 16:30 ICT
