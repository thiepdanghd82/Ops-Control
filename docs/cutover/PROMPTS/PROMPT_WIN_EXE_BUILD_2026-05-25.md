# Build Sequence — Windows CLIENT EXE v1.5.10

> Reference guide AND executable prompt for building the Windows CLIENT
> installer (NSIS .exe) for Ops Control v1.5.10.
>
> Target Win host: separate Windows machine (NOT prod box `10.102.3.61`).
> Lead Engineer: Đặng Thế Thiệp (executes on Win host directly OR delegates to operator with this doc).
> Expected wall-clock: 60-120 min if first-time build; 20-30 min on warm box.
>
> Precedent: Mac SERVER DMG `OpsControl-Server-v1.5.10-mac-arm64.dmg` built Sunday 2026-05-24 05:24 (180 MB) via `scripts/build-desktop.sh mac arm64`.

---

## Context — what we're building

**Architecture** (3-tier per `desktop/package.json`):

```
                   ┌────────────────────────┐
                   │   Mac SERVER (Yen      │
                   │   Phong main box)      │  ← Mac DMG ✅ built
                   │   - Node.js + Express  │
                   │   - SQLite (embedded)  │
                   │   - Serves at :3000    │
                   └───────────▲────────────┘
                               │ HTTP over LAN
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
        │ Win CLIENT │    │ Win CLIENT │    │ Mac CLIENT │
        │ (thin)     │    │ (thin)     │    │ (thin)     │
        │ ~13 ops    │    │            │    │ ~7 ops     │
        └────────────┘    └────────────┘    └────────────┘
              ▲
              │
        Win EXE we're
        building today
```

**Mode**: thin CLIENT (NOT embedded SERVER).

- `OPS_DESKTOP_MODE=thin` (per `desktop/package.json:11`)
- `OPS_REMOTE_URL=http://10.102.3.61:3000` (prod box)
- App = Electron shell pointing to remote URL, no embedded SQLite startup.

**Artifact naming** (per `desktop/package.json:42`):

```
OpsControl-Client-v1.5.10-win-x64.exe       (NSIS installer)
OpsControl-Client-v1.5.10-win-x64.exe       (portable variant — same target)
latest.yml                                  (electron-updater manifest)
```

Build script: `npm run build:client:win` (from repo root `desktop/`).

---

## Pre-requisites on Windows host

### Hardware

- Windows 10 / 11 x64 (anh's separate test machine)
- ≥8 GB RAM (Electron build needs ~4GB peak)
- ≥10 GB free disk (node_modules ~2GB + Electron ~500MB + asar 200MB + tmp ~3GB)
- Network access to github.com + npmjs.com + nodejs.org

### Software (install in order)

| #   | Tool                           | Version | Why needed                               | Install method                                                                    |
| --- | ------------------------------ | ------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Git for Windows                | ≥2.40   | Clone repo + commit history              | https://git-scm.com/download/win                                                  |
| 2   | Node.js                        | 22 LTS  | Match CI (per PR #68 bump 20→22)         | https://nodejs.org/en/download → "LTS Windows Installer (.msi)"                   |
| 3   | Visual Studio Build Tools 2022 | latest  | C++ compiler for `better-sqlite3` native | https://visualstudio.microsoft.com/visual-cpp-build-tools/ → Desktop C++ workload |
| 4   | Python                         | 3.11+   | node-gyp requires                        | Comes bundled with VS Build Tools OR https://www.python.org/downloads/            |
| 5   | PowerShell                     | 5.1+    | Build commands                           | Built-in to Windows                                                               |

### Verify pre-requisites (PowerShell)

```powershell
git --version           # git version 2.42.0.windows.2 OR newer
node --version          # v22.x.x  (NOT v20 — must be v22)
npm --version           # 10.x.x or newer
python --version        # Python 3.11+ (3.12 OK)
cl.exe                  # Should print Microsoft compiler banner OR
                        # error "not recognized" → VS Build Tools missing
```

If ANY pre-req fails → install + reboot → re-verify. Do NOT proceed.

### Repo clone path (CRITICAL — avoid spaces)

**Do NOT clone to `C:\Users\<you>\Documents\Ops Control v1.2`** — path with spaces breaks node-gyp on Windows the same way it does on Mac (see Lesson 25 in `CLAUDE.md`).

**Clone to**:

```powershell
cd C:\
mkdir dev
cd dev
git clone https://github.com/thiepdanghd82/Ops-Control.git
cd Ops-Control
```

Resulting path: `C:\dev\Ops-Control` — no spaces. ✓

---

## Build sequence — 8 steps

### Step 1 — Sync to latest main (2 min)

```powershell
cd C:\dev\Ops-Control
git fetch origin main
git checkout main
git pull --ff-only origin main
git log --oneline -3
# Verify top commit is c67af4b or newer (PR-2 sysadmin docs alignment)
```

**Expected output**: HEAD = `c67af4b` or whatever's currently latest. Tag `v1.5.10` reachable (`git tag --list v1.5.10` returns `v1.5.10`).

### Step 2 — Checkout v1.5.10 tag (1 min)

```powershell
git checkout v1.5.10
# Detached HEAD at f33d5c8 — expected
git status
# Should say "HEAD detached at v1.5.10"
```

**Why detached?**: we build from the tagged release, not from `main`. Any post-tag commits (PR #80, #81 cascade) are docs-only — do NOT affect compiled artifact.

### Step 3 — Install root + desktop deps (10-30 min, depends on network + cache)

```powershell
cd C:\dev\Ops-Control
npm ci --ignore-scripts
# Installs root deps (server runtime + dev tools)
# --ignore-scripts skips postinstall hooks (we'll run them manually)
# Expected duration: 5-10 min first time, ~1 min from cache

cd desktop
npm ci --ignore-scripts
# Installs Electron + electron-builder + native deps
# Expected duration: 5-20 min first time (downloads Electron ~200MB)

# Verify Electron installed
node node_modules\electron\install.js
# Should print "Electron installed successfully"

cd ..
```

**Common failure modes**:

| Symptom                          | Cause                                         | Fix                                                                                        |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `EACCES` permission error        | Running as standard user, npm wants admin     | Open PowerShell as Administrator (right-click → Run as administrator)                      |
| `ETIMEDOUT` on Electron download | Corporate firewall blocks GitHub releases CDN | Set proxy: `npm config set proxy http://<proxy>:<port>` + `npm config set https-proxy ...` |
| `Python not found`               | node-gyp can't find Python                    | `npm config set python "C:\Python311\python.exe"` (full path)                              |
| `gyp ERR! find VS`               | VS Build Tools not detected                   | `npm config set msvs_version 2022`                                                         |

### Step 4 — Build client web bundle (3-5 min)

```powershell
cd C:\dev\Ops-Control\client
npm ci --ignore-scripts
$env:OPS_BUILD_ID = "v1.5.10-win-build-$(Get-Date -Format yyyyMMdd-HHmmss)"
npm run build
# Expected output: "vite v5.x.x building for production…"
# Followed by 30-90s of bundling
# Final: "✓ built in XXs" + size summary

# Verify bundle marker present (per CLAUDE.md G5 requirement)
Select-String -Path "dist\assets\index-*.js" -Pattern "opsctl-v1.3-marker" | Select-Object -First 1
# Expected: marker found with $env:OPS_BUILD_ID embedded

cd ..
```

### Step 5 — Rebuild better-sqlite3 for Electron ABI (5-15 min)

This is the **highest-risk step** per Lesson 28 (Electron NMV 145 vs Node NMV 137 vs Node 22 NMV 127 mismatch).

```powershell
cd C:\dev\Ops-Control\desktop
.\node_modules\.bin\electron-rebuild --module-dir ..\ --only better-sqlite3 --arch x64
# Rebuilds better-sqlite3 against Electron's bundled Node ABI
# Expected duration: 3-10 min (C++ compile)

# Verify the rebuild produced an Electron-compatible binary
Get-Item ..\node_modules\better-sqlite3\build\Release\better_sqlite3.node | Select-Object Length, LastWriteTime
# Should show recent timestamp (just now) + reasonable size (~1-3 MB)
```

**If electron-rebuild fails**:

```powershell
# Try the alternate path — let electron-builder rebuild via postinstall
.\node_modules\.bin\electron-builder install-app-deps
# This is what 'npm run build' does implicitly via postinstall hook
```

### Step 6 — Build Win CLIENT EXE (10-20 min)

```powershell
cd C:\dev\Ops-Control\desktop

# Set role environment for artifact naming + opsMode metadata
$env:OPS_BUILD_ROLE = "Client"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"   # Skip code-signing (no cert yet)

# Build using the role-aware script
npm run build:client:win
# Wraps: OPS_BUILD_ROLE=Client electron-builder --win --config.npmRebuild=false
#        --config.extraMetadata.opsMode=client
#        --config.productName='OpsControl CLIENT'

# Expected duration: 10-20 min
# Watch for:
#   - "asar: writing app.asar"
#   - "building       target=nsis"
#   - "building       target=portable"
```

**Expected artifacts** in `desktop\dist-electron\`:

```
OpsControl-Client-v1.5.10-win-x64.exe         (~180-220 MB, NSIS installer)
OpsControl-Client-v1.5.10-win-x64.exe         (~180-220 MB, portable — same filename, overwrites!)
latest.yml                                    (~500 bytes, electron-updater manifest)
```

**⚠️ NSIS + portable filename collision**: Both targets emit same filename. The portable build overwrites the NSIS in some configs. If anh need both, build separately:

```powershell
# Build NSIS only
npx electron-builder --win nsis --x64 --config.npmRebuild=false `
  --config.extraMetadata.opsMode=client `
  --config.productName='OpsControl CLIENT'

# Rename NSIS to avoid collision
Rename-Item dist-electron\OpsControl-Client-v1.5.10-win-x64.exe `
            OpsControl-Client-v1.5.10-win-x64-installer.exe

# Then build portable
npx electron-builder --win portable --x64 --config.npmRebuild=false `
  --config.extraMetadata.opsMode=client `
  --config.productName='OpsControl CLIENT'

# Rename portable
Rename-Item dist-electron\OpsControl-Client-v1.5.10-win-x64.exe `
            OpsControl-Client-v1.5.10-win-x64-portable.exe
```

### Step 7 — Smoke-test the EXE on Win host (5-10 min)

**Do NOT skip this step.** A built EXE that crashes at first launch = D-0 disaster.

```powershell
cd C:\dev\Ops-Control\desktop\dist-electron

# Install the NSIS installer (if NSIS variant)
.\OpsControl-Client-v1.5.10-win-x64-installer.exe
# Walk through wizard: Accept license, choose install dir (default OK), Install
# Wait for "Installation completed" → Finish

# Find the installed app (default location)
$installDir = "$env:LOCALAPPDATA\Programs\OpsControl CLIENT"
ls $installDir
# Should contain: OpsControl CLIENT.exe, resources/, locales/, etc.

# Launch
& "$installDir\OpsControl CLIENT.exe"
# Expected behavior:
#   1. Splash screen appears
#   2. App attempts connection to OPS_REMOTE_URL (http://10.102.3.61:3000)
#   3. If prod box reachable from Win host: login screen appears
#   4. If prod box NOT reachable: connection error dialog ("ConnectionRefused" or "Cannot reach server")
```

**Pass criteria** (acceptable outcomes):

- ✅ App launches without crash
- ✅ Splash screen → main UI OR connection error dialog
- ✅ No console errors (open DevTools: `Ctrl+Shift+I` if needed)
- ✅ Window close button works

**Fail criteria** (BLOCKER, do NOT ship):

- ❌ App crashes immediately
- ❌ `ERR_DLOPEN_FAILED` in console (native module trap — Lesson 28)
- ❌ White screen of death > 30 seconds
- ❌ `compiled against NMV X, requires NMV Y` error

### Step 8 — Compute SHA256 + upload preparation (2 min)

```powershell
cd C:\dev\Ops-Control\desktop\dist-electron

# Compute SHA256 for verification
Get-FileHash -Algorithm SHA256 OpsControl-Client-v1.5.10-win-x64*.exe

# Output example:
# Algorithm  Hash                                                                Path
# ---------  ----                                                                ----
# SHA256     A1B2C3...                                                           OpsControl-Client-v1.5.10-win-x64-installer.exe

# Save hash for upload manifest
Get-FileHash -Algorithm SHA256 OpsControl-Client-v1.5.10-win-x64*.exe | `
  Out-File OpsControl-Client-v1.5.10-win-x64.SHA256
```

---

## Post-build verification — bundle marker check

Per CLAUDE.md G5 + S-DEP-AUDIT pattern, the bundle marker must contain the build ID we set in Step 4.

```powershell
cd C:\dev\Ops-Control\desktop\dist-electron

# Extract the asar bundle inside the EXE for marker check
# (electron-builder packages app.asar inside the installer)
# This is an OPTIONAL deep-verify step — skip if Step 7 smoke-test passed

# Install temporary asar tool
npm install -g @electron/asar
asar extract <installer>.exe extracted-app
findstr "opsctl-v1.3-marker" extracted-app\assets\*.js
# Should show marker line containing your OPS_BUILD_ID from Step 4
```

If marker missing or wrong build ID → bundle was built from stale `client/dist/` — go back to Step 4.

---

## Upload to prod `/updates/` (anh does after build)

After Step 7 smoke-test passes + Step 8 SHA256 computed, anh uploads to prod:

```powershell
# From Win host, SCP to prod box (assuming SSH key configured)
scp OpsControl-Client-v1.5.10-win-x64*.exe `
    OpsControl-Client-v1.5.10-win-x64.SHA256 `
    latest.yml `
    user@10.102.3.61:/c/opt/ops-control/server/data/updates/

# OR via RDP + copy-paste to \\10.102.3.61\ops-control\server\data\updates\
```

Verify on prod box:

```bash
# SSH to prod
ls -lh /c/opt/ops-control/server/data/updates/
# Should show all 3 files with reasonable sizes:
#   OpsControl-Client-v1.5.10-win-x64-installer.exe  ~200 MB
#   OpsControl-Client-v1.5.10-win-x64-portable.exe   ~200 MB
#   OpsControl-Client-v1.5.10-win-x64.SHA256         ~80 bytes
#   latest.yml                                       ~500 bytes
```

Verify served by Ops Control server:

```bash
# From Win client machine (after install)
curl -I http://10.102.3.61:3000/updates/OpsControl-Client-v1.5.10-win-x64-installer.exe
# Expected: HTTP/1.1 200 OK, Content-Length: ~200000000
```

---

## Deliverable Report format (anh report back to em)

After build complete + smoke-test passed, ping em with:

```
Win EXE Build Deliverable Report

1. Build environment
- Host: <Win 10 OR Win 11>
- Node: <v22.X.X>
- VS Build Tools: <Installed YES / NO>
- Clone path: <C:\dev\Ops-Control>

2. Artifacts produced
File                                                | Size      | SHA256 (first 16 chars)
OpsControl-Client-v1.5.10-win-x64-installer.exe    | <XXX MB>  | <abc123...>
OpsControl-Client-v1.5.10-win-x64-portable.exe     | <XXX MB>  | <def456...>
latest.yml                                          | <XXX B>   | -

3. Verification
✅ App launches without crash
✅ Splash → main UI OR connection error (depending on prod reachability)
✅ No ERR_DLOPEN_FAILED in console
✅ Bundle marker contains OPS_BUILD_ID from Step 4

4. Build wall-clock
- Step 1 (sync main):       <X> min
- Step 2 (checkout tag):    <X> min
- Step 3 (npm ci):          <X> min
- Step 4 (client build):    <X> min
- Step 5 (electron-rebuild):<X> min
- Step 6 (electron-builder):<X> min
- Step 7 (smoke-test):      <X> min
- Step 8 (sha256 + upload): <X> min
- TOTAL                     <X> min

5. Issues encountered (if any)
<None> OR <list of failures + how resolved>

6. Upload status
- Local artifacts at: C:\dev\Ops-Control\desktop\dist-electron\
- Uploaded to prod /updates/: <YES / NO / SCHEDULED FOR <time>>
```

---

## STOP triggers — when to halt + ping em

| Trigger                                            | Action                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Step 3 npm ci fails with permission/network errors | Try Admin PowerShell + proxy config. If still failing > 30 min → ping em                   |
| Step 5 electron-rebuild fails (NMV mismatch)       | Try `npm run build` with `--config.npmRebuild=true` instead. If still failing → ping em    |
| Step 6 electron-builder fails with asar error      | Check `desktop/package.json` `files` + `asarUnpack` paths. Ping em with full error         |
| Step 7 EXE crashes on launch                       | DO NOT SHIP. Capture crash log from `%LOCALAPPDATA%\Programs\OpsControl CLIENT\` → ping em |
| Anh fatigue / 90+ min spent without progress       | Pause. Lunch + rest. Resume later. Don't push tired through hardware setup                 |

---

## Risk assessment (em IBM-perspective)

**HIGH risk steps** (probability of fail ≥30%):

- Step 3: npm ci on first-time Windows host (corporate firewall + proxy + cache misses)
- Step 5: electron-rebuild better-sqlite3 (native compile + ABI mismatch)
- Step 7: smoke-test (latent NMV mismatch surfaces here)

**MEDIUM risk steps** (10-30%):

- Step 4: client build (vite config + bundle marker injection)
- Step 6: electron-builder (asar packaging + native module overlay)

**LOW risk steps** (<10%):

- Step 1-2: git ops
- Step 8: hash computation
- Upload: well-trodden SCP

**Time budget**: em recommend 3 hours for first attempt. If still not done at 3h → STOP + ping em with current state. We may need to pivot to Mac-only first go-live (Win CLIENT shipped D+1 patch).

---

## Companion docs

- `desktop/package.json` — build configuration source of truth
- `scripts/build-desktop.sh` — Mac build wrapper (this Win flow runs natively, doesn't use this script)
- `CLAUDE.md` Lesson 25 — paths-with-spaces trap
- `CLAUDE.md` Lesson 28 — Electron native module ABI trap
- `CLAUDE.md` MES-3-FIX-26 — node-hid + serialport extraResources overlays (covered by current `desktop/package.json`)
- `docs/MIGRATION-DAY-0.md` — Day-0 deployment playbook
- `docs/cutover/D-1_FINAL_CHECKLIST_2026-06-08.md` — checklist item #6 references both DMG + EXE

---

## Next steps after Win EXE build success

1. **Commit nothing** — built artifacts are NOT committed to git (they're in `desktop/dist-electron/` which is gitignored)
2. **Upload to prod /updates/** — covered above
3. **Update D-1 checklist** — when ticking checklist item #6, both Mac DMG + Win EXE must be confirmed on prod
4. **Ping em** with Deliverable Report — em updates task #44/#43 status + STOP_TRIGGERS sign-off if anh wants
5. **Optional**: provision 1 Win client laptop with the EXE this week as a smoke-test of the install flow (separate from build smoke-test)

**Anh has D-15 today → D-7 (Tue 2026-06-02) = 8 days to resolve any Win EXE issues. Plenty of buffer if Step 3-7 take 2 attempts.**
