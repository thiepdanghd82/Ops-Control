# Build Infrastructure Audit — Cross-Platform Distribution Readiness

**Audit date:** 2026-05-04
**Branch:** `main` (post v1.5.1)
**Scope:** Read-only inspection. Goal: assess readiness for distributing Ops Control to 50 clients across Windows + macOS with central server (Win or Mac) running as a service/daemon, with auto-update.
**Method:** Inspected `package.json` × 4 + `desktop/build` config + `auto-update.js` + `deploy.{sh,ps1,bat}` + `.github/workflows/ci.yml` + `desktop/dist-electron/` artifacts. No code changes, no installs, no builds.

---

## Executive summary

**Most of the infrastructure already exists.** The desktop/ folder ships a fairly mature Electron + electron-builder + electron-updater stack with hybrid CLIENT/SERVER product builds, generic-provider auto-update pointing at `http://10.102.3.61/updates/`, native-module unpacking from ASAR, and server code bundled inside the Electron .app via `extraResources`.

The gaps are **operational** (CI doesn't build Windows installers; no automated upload to the update endpoint; no macOS launchd service for the server-mode case) rather than architectural.

**TL;DR — for the 50-client Win+Mac goal:**

| Pillar                                                                                  | Status           | Critical gap?                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electron + builder                                                                      | ✅ done          | No                                                                                                                                               |
| Hybrid CLIENT/SERVER product names                                                      | ✅ done          | No                                                                                                                                               |
| Auto-update wiring (renderer + main)                                                    | ✅ done          | No                                                                                                                                               |
| Auto-update CONTENT delivery (uploading latest.yml + DMG/exe to `10.102.3.61/updates/`) | 🟡 partial       | **Yes — manual rsync today; no CI publish step**                                                                                                 |
| Windows installer build                                                                 | 🚫 missing in CI | **Yes — only macOS arm64 builds in CI today**                                                                                                    |
| macOS server-mode service (launchd)                                                     | 🚫 missing       | Conditional yes — only if a Mac box hosts the server                                                                                             |
| Windows server-mode service (NSSM)                                                      | 🟡 partial       | Operator-installed; deploy.ps1 documents but doesn't auto-run                                                                                    |
| Code signing                                                                            | 🚫 deferred      | **Yes for production** — currently relies on `xattr -d com.apple.quarantine` workaround on macOS + `verifyUpdateCodeSignature: false` on Windows |
| Cross-platform CI matrix                                                                | 🚫 macOS-only    | **Yes — add Windows runner**                                                                                                                     |

---

## 1. Workspace structure

| Item              | Value                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Workspace type    | **Standalone** (no npm workspaces, no lerna, no monorepo tooling)                                           |
| Package count     | 4 source `package.json` (`./`, `client/`, `desktop/`, `apps/kiosk/`) + 1 auto-generated inside built `.app` |
| Root version      | `1.5.0` (will become `1.5.1` once tag-driven)                                                               |
| Client version    | `1.3.0` (drift — F0-2 in audit)                                                                             |
| Desktop version   | `1.3.0` (drift)                                                                                             |
| Kiosk version     | `0.1.0`                                                                                                     |
| Module type       | `"type": "module"` at root (ESM)                                                                            |
| Workspace tooling | None — each subfolder has its own `npm install` lifecycle                                                   |

**Implication for distribution:** the lack of npm workspaces means each install/build path is independent. CI already handles this via `npm ci` per subfolder (root + client + desktop). For 50-client distribution, the 4-package layout works fine but version sync is manual (release-please candidate from F0-2).

---

## 2. Server packaging

### Current method

- **Plain `node server/index.js`** — no `pkg`/`nexe`/`caxa` standalone bundling. Requires Node 20.x installed on the host.
- **Embedded path:** server code is BUNDLED inside the Electron `.app` via `desktop/package.json` `build.extraResources` block:
  ```
  ../server  → app/server         (excludes *.test.js, legacy/)
  ../scripts → app/scripts        (only *.js, no test files)
  ../node_modules → app/node_modules  (heavy-trimmed via filter)
  ../package.json → app/package.json
  ```
  This means `OpsControl SERVER.app` (built via `build:server:mac` / `build:server:win`) physically ships the server code inside the bundle. No separate Node install on the operator box required.
- **Standalone path** (current 10.102.3.61 prod): operator runs `node server/index.js` directly with system Node.

### Service install

| Platform | Method                                                                                             | Status                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Linux    | systemd unit (deploy.sh ExecStart=/usr/bin/node server/index.js, Restart=on-failure)               | ✅ Automated end-to-end in deploy.sh                                                         |
| Windows  | NSSM service (deploy.ps1 prints install commands; operator runs `nssm install`/`set`/`start` once) | 🟡 Manual first-time install; subsequent restarts automated via `nssm restart` in deploy.ps1 |
| macOS    | None — no launchd plist anywhere                                                                   | 🚫 Missing entirely                                                                          |

### Native deps (require platform-specific rebuild)

| Dep              | Root version | Desktop version | Drift                        |
| ---------------- | ------------ | --------------- | ---------------------------- |
| `better-sqlite3` | `^12.9.0`    | `^11.3.0`       | ⚠ Major-version drift (F0-3) |
| `node-hid`       | —            | `^3.1.2`        | desktop-only                 |
| `serialport`     | —            | `^12.0.0`       | desktop-only                 |

`postinstall: electron-builder install-app-deps` in desktop/ handles cross-platform native rebuild during install. `--config.npmRebuild=false` flag passed to all builder scripts (per CLAUDE.md L25 — paths-with-spaces breaks node-gyp on this dev box).

---

## 3. Client packaging — Electron stack (mature)

### Versions

- `electron`: **^41.3.0**
- `electron-builder`: **^26.8.1**
- `electron-updater`: **^6.3.9**

### Build matrix (already exists)

| Script                           | Output                            | Status                                     |
| -------------------------------- | --------------------------------- | ------------------------------------------ |
| `npm run build` (default)        | electron-builder default          | Local-machine-native                       |
| `npm run build:win`              | Windows NSIS + portable, x64      | Manual run                                 |
| `npm run build:mac`              | macOS DMG + .app                  | Manual run                                 |
| `npm run build:all`              | Mac + Win in one go (`-mw`)       | Local only                                 |
| `npm run build:client:{mac,win}` | "OpsControl CLIENT" branded build | ✅ Hybrid product, opsMode=client metadata |
| `npm run build:server:{mac,win}` | "OpsControl SERVER" branded build | ✅ Hybrid product, opsMode=server metadata |

### Build outputs

| Target  | Specifics                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows | NSIS installer + portable .exe, x64 only                                                                                                        |
| macOS   | DMG (icon: `build/icon.icns`, entitlements: `build/entitlements.mac.plist`) — arm64 confirmed by CI; macOS x64 (Intel) NOT in current CI matrix |

### ASAR + native-module handling

`asar: true` with `asarUnpack` for `better-sqlite3`, `serialport`, `node-hid`, `@serialport/*`. Confirmed correct — these native modules need to be loadable as separate files, not from inside the ASAR archive.

### `extraResources` (server-in-Electron-bundle)

Already documented in §2. Means `OpsControl SERVER.app` is a single-DMG/EXE deliverable that contains everything to run the server — no separate Node install required on the operator box. **This is the load-bearing design choice for the 50-client distribution.**

---

## 4. Auto-update (mature, end-to-end)

### Renderer + main wiring

- `desktop/auto-update.js` — wraps `electron-updater` with lazy-init pattern (electron-updater@6 initialises eagerly on access, so it's gated behind `getAutoUpdater()`)
- `_autoUpdater.autoDownload = true; _autoUpdater.autoInstallOnAppQuit = true` — auto-flow ready
- Event handlers wired: `checking-for-update`, `update-available`, `update-not-available`, `error`, `download-progress`
- IPC bridge in `desktop/preload.js`: `ops:updater.check` exposed to renderer

### Publish provider (already configured)

```json
"publish": [
  {
    "provider": "generic",
    "url": "http://10.102.3.61/updates/",
    "channel": "latest"
  }
]
```

### Update content artifacts (already-generated samples)

`desktop/dist-electron/` contains:

- `latest.yml` (Windows update manifest)
- `latest-mac.yml` (macOS update manifest)
- `mac-arm64/` (built .app for arm64)
- `builder-debug.yml`

Proves the generation half of the pipeline works end-to-end. **Missing:** automated upload of these files to `http://10.102.3.61/updates/` after each tagged release. Today this is a manual `rsync` (or worse — manual scp).

### Code-signature verification

- macOS: relies on `xattr -d com.apple.quarantine` workaround per `install-from-dmg.sh` (CCL doesn't pay $99/year Apple Developer ID per CLAUDE.md)
- Windows: `verifyUpdateCodeSignature: false` in build config — auto-update accepts unsigned binaries
- **Risk for 50-client distribution:** an attacker who can compromise `http://10.102.3.61/updates/` can push a malicious binary that auto-installs on every client. Not unique to this app (same threat as any unsigned update), but worth flagging — the existing trust chain is "the LAN is trusted."

---

## 5. CI/CD (`.github/workflows/ci.yml`)

### Jobs already in place

| Job                    | Runs on                            | Notes                                                                         |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `audit`                | ubuntu-latest                      | npm audit per package                                                         |
| `lint`                 | ubuntu-latest                      | eslint + format check                                                         |
| `commitlint`           | ubuntu-latest                      | Re-validates Conventional Commits on PR                                       |
| `router-test-coverage` | ubuntu-latest                      | ADR-0013 — every domain router has sibling test                               |
| `build`                | ubuntu-latest                      | Client build + perf-budget; uploads `client/dist/` artifact                   |
| `build-installers`     | **macos-14 only**, **on tag only** | `npx electron-builder --mac --arm64`; verifies bundle marker; uploads `*.dmg` |

### Critical gaps for cross-platform distribution

1. **No Windows installer build job.** `build-installers` is `runs-on: macos-14` only. To ship `.exe` to 50 Windows clients, need `runs-on: windows-latest` matrix entry running `npm run build:client:win` + `build:server:win`.
2. **No publish step.** CI uploads to GitHub Actions artifacts (7-day retention), NOT to `http://10.102.3.61/updates/`. Auto-update will see the new version via `latest.yml` only if someone manually rsyncs the build.
3. **macOS x64 not built.** Only `--arm64` in CI. Operators on Intel Macs (rarer post-2024 but still real) are not served.
4. **No publish-on-release workflow.** Tag-driven `build-installers` triggers on `refs/tags/v*` but only outputs an artifact; no `electron-builder --publish=always` to push to the update endpoint.

---

## 6. apps/ folder

| Folder               | Purpose                                                             | Status                                                 |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/kiosk/`        | MES-2 Kiosk PWA workspace (Vite + React 19) — separate from desktop | ✅ Operational, version 0.1.0                          |
| (no `apps/desktop/`) | n/a                                                                 | The main desktop is at `desktop/`, not `apps/desktop/` |
| (no `apps/server/`)  | n/a                                                                 | Server lives at `server/`, not `apps/server/`          |

The `apps/` folder structure proposed in `README FIRST/CLAUDE.md` (the v1.3 reorg map) NEVER SHIPPED. The repo retained the v1.2 layout: `client/` + `server/` + `desktop/` + `apps/kiosk/` (added in MES-2). Per Step B retrospective F-FU-4, the README FIRST/ docs describe an aspirational reorg that was never executed.

---

## 7. GAP analysis for "50 clients on Win+Mac, server as service, auto-update"

### Already done (✅ — no work needed)

| Capability                                                                               | Where it lives                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Electron 41 + electron-builder 26 + electron-updater 6                                   | desktop/package.json                          |
| Hybrid CLIENT/SERVER product builds (single codebase)                                    | `extraMetadata.opsMode` + 4 dedicated scripts |
| Auto-update with generic provider pointed at 10.102.3.61                                 | desktop/auto-update.js + build.publish        |
| ASAR + native-module unpacking (better-sqlite3, serialport, node-hid)                    | desktop/package.json `asarUnpack`             |
| Server bundled INSIDE Electron app (no separate Node install)                            | desktop/package.json `extraResources`         |
| Linux systemd service install                                                            | deploy.sh                                     |
| Windows NSSM service restart automation                                                  | deploy.ps1                                    |
| Backup + rollback runbook (Sprint 1.7 snapshot pattern)                                  | CLAUDE.md "Recovery playbook"                 |
| CI: vulnerability scan + lint + commitlint + tests + perf-budget + macOS arm64 DMG build | .github/workflows/ci.yml                      |
| Bundle marker verification (anti-tamper)                                                 | scripts/verify-bundle-marker.sh + CI step     |

### To add (🚫 missing — required for the goal)

| #   | Gap                                                                                                                                                                                                | Why critical                                                                                                                                                        | Effort                                                                 | Owner  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| 1   | **CI: Windows installer build job** (`runs-on: windows-latest`) running `build:client:win` + `build:server:win`                                                                                    | Without this, Windows .exe is never built in a reproducible way; can't ship to Win clients                                                                          | M (~2 h to add matrix + verify on a tag)                               | DevOps |
| 2   | **CI publish step** — wire `electron-builder --publish=always` OR add a separate `gh-pages`/rsync/scp job that uploads `latest.yml` + `*.exe` + `*.dmg` to `http://10.102.3.61/updates/` after tag | Without this, auto-update endpoint is empty; clients never see new versions                                                                                         | M (~2-4 h depending on chosen upload method)                           | DevOps |
| 3   | **macOS launchd plist for server-mode** (e.g. `com.cclvietnam.opscontrol.plist` with `Label`, `ProgramArguments`, `RunAtLoad: true`, `KeepAlive: true`) — drop-in equivalent of systemd unit       | Required ONLY if a Mac box hosts the server. If staying Windows-only for server, can defer.                                                                         | S (~1 h to write + 1 h to wire into deploy.sh / a new `deploy-mac.sh`) | DevOps |
| 4   | **NSSM auto-install in deploy.ps1** — detect if `nssm install` already ran; if not, run it (with confirmation prompt)                                                                              | Today the operator gets `Write-Warn` instructions; first-time deploy on a new Win box is a manual ritual                                                            | S (~1 h)                                                               | DevOps |
| 5   | **macOS x64 build** in CI (Intel Mac coverage)                                                                                                                                                     | Some operators on older Macs; arm64-only excludes them                                                                                                              | XS (add `--x64` alongside `--arm64` in existing matrix)                | DevOps |
| 6   | **Update server (`http://10.102.3.61/updates/`) static file hosting documentation + setup**                                                                                                        | The publish provider points there but there's no doc or script for setting up a static file server. Could be a Caddy/nginx site, or an S3-compatible bucket on LAN. | S (~2 h doc + sample Caddy config)                                     | DevOps |

### To upgrade (🟡 — exists but rough edges)

| #   | Item                                                            | Effort                                      | Owner   |
| --- | --------------------------------------------------------------- | ------------------------------------------- | ------- |
| 1   | better-sqlite3 version drift (root 12.9 vs desktop 11.3) — F0-3 | S (~30 min)                                 | BE      |
| 2   | electron-store 3 majors behind — F1-16                          | S (~1 h)                                    | Desktop |
| 3   | ESLint version drift root v10 / client v9 — F1-17               | S (~30 min)                                 | DevOps  |
| 4   | Sub-package version sync (F0-2 — release-please candidate)      | M (~1 sprint to add release-please tooling) | Release |

### Optional / deferred (security maturity, not blocking the goal)

| #   | Item                                                                       | Effort                                                      | When                                 |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| 1   | Apple Developer ID + macOS code signing + notarization                     | $99/yr + ~4 h setup                                         | When CCL HQ approves the spend       |
| 2   | Windows code signing (EV cert) + flip `verifyUpdateCodeSignature: true`    | $200-400/yr + ~4 h                                          | Same                                 |
| 3   | Update channel separation (e.g. `staging` channel for testing pre-release) | S (~1 h, just a separate `channel:` value in build.publish) | Any time                             |
| 4   | Bytecode protection / source obfuscation                                   | M-L                                                         | Out of scope — internal-only project |

---

## 8. Effort estimate per gap (priority-ordered)

| Priority  | Gap #            | Item                                                    | Effort                 | Blocker for goal?                                          |
| --------- | ---------------- | ------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| **P0**    | 1                | Windows installer build in CI                           | ~2 h                   | YES                                                        |
| **P0**    | 2                | CI publish to update endpoint                           | 2-4 h                  | YES                                                        |
| **P0**    | 6                | Static file server for `10.102.3.61/updates/`           | 2 h doc + Caddy config | YES (without this, gap #2 has nowhere to publish)          |
| **P1**    | 4                | NSSM auto-install in deploy.ps1                         | 1 h                    | No (manual works), but quality-of-life for Win-server case |
| **P1**    | 3                | macOS launchd plist for server-mode                     | 2 h                    | Only if Mac will host server                               |
| **P2**    | 5                | macOS x64 build in CI                                   | XS                     | Coverage gap, not a blocker                                |
| **P2**    | "to upgrade" 1-3 | Version drifts (better-sqlite3, electron-store, ESLint) | S each                 | Hygiene                                                    |
| **Defer** | "optional" 1-2   | Code signing                                            | $-driven               | Out of scope unless CCL HQ funds                           |

**Total estimated work to close P0 gaps: 6-8 hours** of focused DevOps work. After P0 closure: tag a release → CI builds Win + Mac installers → CI publishes to update endpoint → 50 clients auto-update on next launch.

---

## 9. Recommended next steps (NOT executing — read-only audit per scope)

1. **Decide server host platform.** If staying Windows (current 10.102.3.61), Gap #3 (launchd) can be skipped. If hybrid Win+Mac server, Gap #3 is required.
2. **Decide update server topology.** Three options for `http://10.102.3.61/updates/`:
   - (a) Caddy/nginx static file server on the same box as the API (simplest)
   - (b) Separate static-file box behind reverse proxy
   - (c) S3-compatible bucket on LAN (e.g. MinIO) — overkill for 50 clients
3. **Add Windows runner to CI** (Gap #1) FIRST — without this, no other progress on Windows distribution can be tested.
4. **Wire CI publish** (Gap #2) — pick `electron-builder --publish=always` if the credentials can live in GitHub Actions secrets, otherwise a separate `rsync` job after the build.
5. **Update operator-facing docs:**
   - `MIGRATION_GUIDE.md` to note the auto-update flow once it's wired (currently mentions Setup Wizard for first install only)
   - New `docs/runbooks/distribution-pipeline.md` documenting the tag → CI build → publish → client auto-update flow

---

## 10. Cross-references

- v1.5.1 release (most recent baseline): `git show v1.5.1`
- Sprint 1.7 deploy snapshot pattern: `CLAUDE.md` § "Recovery playbook" → "Bad deploy"
- Native-module + paths-with-spaces caveat: `CLAUDE.md` lesson 25
- v1.3 GA build evidence: `desktop/dist-electron/mac-arm64/` (already-built sample)
- Audit findings F0-2 (version drift), F0-3 (better-sqlite3 drift), F1-16 (electron-store), F1-17 (ESLint): `docs/audit/FINAL-REPORT.md` §2 Bug Inventory
- Step B retrospective on infrastructure assumptions: `docs/audit/STEP-B-RETROSPECTIVE.md` §4.4 (Phase 4 .sh-biased) + F-FU-3 (deploy script triple drift)

**Audit verdict:** The architectural work is done. The operational work (CI cross-platform, publish step, update server hosting) is the remaining gate to a 50-client cross-platform deployment. Estimated 6-8 hours of focused DevOps to close all P0 gaps.

**End of audit. No code changed; no installs run; no builds executed.**
