# ═══════════════════════════════════════════════════════════════
# Ops Control v1.2 — Deploy to Production (Windows)
# ═══════════════════════════════════════════════════════════════
#
# PowerShell equivalent of deploy.sh. Use when the prod server is a
# Windows box (e.g. 10.102.3.61). The client build step is identical
# on both OSes — only the file sync + service setup differ.
#
# Usage:
#   .\deploy.ps1                          # Local build only
#   .\deploy.ps1 -Remote user@10.102.3.61 # Deploy over SSH (OpenSSH)
#   .\deploy.ps1 -Remote ... -SkipBuild   # Don't rebuild client
#
# Prerequisites on Windows client:
#   - PowerShell 5.1+ (or PowerShell Core 7+)
#   - Node.js 18+, npm
#   - OpenSSH client (Settings → Apps → Optional features)
#
# Prerequisites on Windows server:
#   - Node.js 18+
#   - OpenSSH server (enabled + firewalled to dev network)
#   - NSSM (non-sucking service manager) OR node-windows for
#     auto-start. The script assumes NSSM is in PATH.
#
# Sprint 11 P1-3 + P2-1:
#   - This script preserves the server's existing OPS_TOTP_KEY
#     across deploys. Losing that key locks all users out of 2FA
#     (see CLAUDE.md "TOTP key mismatch at boot"). We read the
#     live .env via SSH, extract OPS_TOTP_KEY, and re-inject it
#     into the fresh .env we push.
# ═══════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
  [string]$Remote,
  [switch]$SkipBuild,
  [string]$AppName = 'ops-control',
  [string]$RemoteDir = 'C:\opt\ops-control',
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $PSCommandPath
Set-Location $scriptDir

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════╗'
Write-Host '  ║      Ops Control v1.2 — Deploy (Windows)        ║'
Write-Host '  ╚══════════════════════════════════════════════════╝'
Write-Host ''

# ── 1. Build client (unless skipped) ───────────────────────────
if (-not $SkipBuild) {
  Write-Step '🔨  Building client…'
  Push-Location .\client
  try { & npx vite build }
  finally { Pop-Location }
  Write-Ok '✓  Client built'
  Write-Host ''
}

# ── 2. Local-only? Done. ───────────────────────────────────────
if (-not $Remote) {
  Write-Step '📂  Local deployment only.'
  Write-Ok  "✓  App ready at: http://localhost:$Port"
  Write-Host ''
  Write-Host '  Start with: node server\index.js'
  Write-Host "  Or:         npm start"
  return
}

# ── 3. Preserve the FULL remote .env across deploys ───────────
# Sprint 11 P2-1 protected only OPS_TOTP_KEY. Sprint 1.7 audit (§8)
# found that EVERY OTHER env var was clobbered: OPS_BACKUP_SCHEDULE,
# OPS_BACKUP_WEBHOOK, OPS_CORS_ORIGINS, OPS_DB_PATH, OPS_DATA_BACKEND,
# OPS_PWD_MAX_AGE_DAYS, OPS_BACKUP_RETENTION_DAYS, OPS_REQUIRE_2FA_ROLES,
# etc. → backups silently turned off after each Windows deploy. Fix:
# capture the WHOLE remote .env into a hashtable, merge new keys from
# the new release's .env.example, write back as a single file.
Write-Step '🔐  Reading existing remote .env (preserves all operator-set values)…'
$existingEnv = @{}     # ordered key → raw line
$existingOrder = @()   # preserve original ordering for diff-readability
try {
  $remoteEnv = ssh $Remote "type $RemoteDir\.env 2>nul"
  if ($LASTEXITCODE -eq 0 -and $remoteEnv) {
    foreach ($line in $remoteEnv) {
      if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
        $k = $Matches[1]
        if (-not $existingEnv.ContainsKey($k)) { $existingOrder += $k }
        $existingEnv[$k] = $line
      }
    }
  }
} catch {
  Write-Warn "  (No prior .env found — treating as fresh install.)"
}
$existingKey = if ($existingEnv.ContainsKey('OPS_TOTP_KEY')) {
  ($existingEnv['OPS_TOTP_KEY'] -replace '^\s*OPS_TOTP_KEY\s*=\s*','').Trim('"').Trim("'")
} else { $null }
$existingKioskKey = if ($existingEnv.ContainsKey('OPS_KIOSK_KEY')) {
  ($existingEnv['OPS_KIOSK_KEY'] -replace '^\s*OPS_KIOSK_KEY\s*=\s*','').Trim('"').Trim("'")
} else { $null }
if ($existingEnv.Count -gt 0) {
  Write-Ok "✓  Captured $($existingEnv.Count) existing env line(s) for merge-back"
}
if ($existingKey) {
  Write-Ok "✓  Preserving existing OPS_TOTP_KEY ($($existingKey.Length) chars)"
} else {
  Write-Warn "⚠  No existing OPS_TOTP_KEY — operator must set one in .env before boot."
  Write-Warn "    Without it, the server refuses to start in NODE_ENV=production."
}
# Sprint MES-2.3 — kiosk JWT signing key (mirrors OPS_TOTP_KEY semantics).
if ($existingKioskKey) {
  Write-Ok "✓  Preserving existing OPS_KIOSK_KEY ($($existingKioskKey.Length) chars)"
} else {
  Write-Warn "⚠  No existing OPS_KIOSK_KEY — operator must set one in .env before boot."
  Write-Warn "    Without it, kiosk pairings can't be issued in NODE_ENV=production."
}
Write-Host ''

# ── 4. Ensure remote directory exists ──────────────────────────
Write-Step "📂  Preparing $RemoteDir on $Remote…"
ssh $Remote "if not exist `"$RemoteDir\server`" mkdir `"$RemoteDir\server`""
ssh $Remote "if not exist `"$RemoteDir\client\dist`" mkdir `"$RemoteDir\client\dist`""

# ── 5. Upload files ────────────────────────────────────────────
# Windows has no rsync by default. We use SCP, which is slower
# but universally available with OpenSSH. For large deltas,
# install rsync on the server (MSYS2 or Cygwin) and swap in.
Write-Step '📤  Uploading server + build artifacts…'
scp -r server              "${Remote}:$RemoteDir/"
scp -r client\dist         "${Remote}:$RemoteDir/client/"
scp    package.json        "${Remote}:$RemoteDir/"
scp    package-lock.json   "${Remote}:$RemoteDir/"
if (Test-Path 'scripts') {
  scp -r scripts           "${Remote}:$RemoteDir/"
}

# ── 6. Write .env merging captured remote values + new release keys ──
# Sprint 1.7 audit §8 fix. Strategy: take the captured remote .env as
# the authoritative source. Add new keys from the new release's
# .env.example that the captured file lacks. Existing operator-set
# values always win.
Write-Step '📝  Merging .env (preserves all operator values, adds new release keys)…'
$mergedLines = @()
# 1. Always-present base: NODE_ENV + PORT (overridable from existing)
if (-not $existingEnv.ContainsKey('NODE_ENV')) { $mergedLines += "NODE_ENV=production" }
if (-not $existingEnv.ContainsKey('PORT'))     { $mergedLines += "PORT=$Port" }
# 2. Replay existing lines in original order
foreach ($k in $existingOrder) { $mergedLines += $existingEnv[$k] }
# 3. Append any new keys from .env.example that the captured file lacks
if (Test-Path '.env.example') {
  Get-Content '.env.example' | ForEach-Object {
    $line = $_
    if ($line -match '^\s*$' -or $line -match '^\s*#') { return }
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=') {
      $k = $Matches[1]
      if (-not $existingEnv.ContainsKey($k)) {
        $mergedLines += $line
        Write-Host "    + new key: $k"
      }
    }
  }
}
$envBody = $mergedLines -join "`n"
$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value $envBody -NoNewline
scp $tmp.FullName "${Remote}:$RemoteDir/.env"
Remove-Item $tmp

# ── 7. npm install on the server ───────────────────────────────
Write-Step '📦  Installing dependencies…'
ssh $Remote "cd /d `"$RemoteDir`" && npm install --production"

# ── 7b. Preflight gate before service restart ──────────────────
# Sprint 1.7 audit §8: catch missing/invalid env vars BEFORE flipping
# the service. A failed preflight aborts the deploy with a clear error
# instead of leaving NSSM in restart-loop with the new bundle.
Write-Step '🔎  Running preflight against staged .env…'
ssh $Remote "cd /d `"$RemoteDir`" && set NODE_ENV=production && npm run preflight"
if ($LASTEXITCODE -ne 0) {
  Write-Warn '✘  Preflight failed — refusing to restart the service.'
  Write-Warn '   The new bundle is uploaded but NOT yet activated. Fix .env'
  Write-Warn '   on the remote, then re-run this deploy.ps1 to retry.'
  exit 1
}

# ── 8. Restart the service (NSSM) ──────────────────────────────
# We DO NOT use `net stop` directly — NSSM handles graceful
# shutdown, log rotation, and restart-on-failure. If NSSM is
# not installed, fall back to a manual note for the operator.
Write-Step '🔄  Restarting service…'
$restartCmd = "nssm restart $AppName"
$restart = ssh $Remote $restartCmd
if ($LASTEXITCODE -ne 0) {
  Write-Warn "⚠  NSSM restart failed (is the service installed?)."
  Write-Warn "    Install once with: nssm install $AppName `"C:\Program Files\nodejs\node.exe`" `"$RemoteDir\server\index.js`""
  Write-Warn "    Then: nssm set $AppName AppDirectory `"$RemoteDir`""
  Write-Warn "    Then: nssm set $AppName AppEnvironmentExtra NODE_ENV=production"
  Write-Warn "    Then: nssm start $AppName"
}

# ── 9. Smoke-check ─────────────────────────────────────────────
Write-Step '🩺  Smoke-checking…'
Start-Sleep -Seconds 3
try {
  $health = Invoke-WebRequest -Uri "http://$($Remote -replace '.+@','' ):$Port/health" `
    -UseBasicParsing -TimeoutSec 10
  if ($health.StatusCode -eq 200) {
    Write-Ok "✓  Server healthy ($($health.StatusCode))"
  } else {
    Write-Warn "⚠  /health returned $($health.StatusCode)"
  }
} catch {
  Write-Warn "⚠  /health check failed: $($_.Exception.Message)"
  Write-Warn '    Check logs: ssh <remote> "nssm status ops-control"'
}

Write-Host ''
Write-Host '  ══════════════════════════════════════════'
Write-Ok  '  ✅  Deploy complete!'
Write-Host ''
Write-Host "  URL:    http://$($Remote -replace '.+@','' ):$Port"
Write-Host "  Logs:   ssh $Remote `"nssm status $AppName`""
Write-Host '  ══════════════════════════════════════════'
