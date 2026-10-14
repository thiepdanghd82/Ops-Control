@echo off
REM ===========================================================================
REM  check-license.bat — OpsControl fleet license audit (Windows)
REM
REM  DOUBLE-CLICK to run. No install needed (uses built-in PowerShell).
REM  Prints ONE status line:
REM     COMPUTERNAME | type | tier | expires_at | days-left
REM
REM  Reads the desktop license file directly:
REM     %APPDATA%\ops-control-desktop\license.json
REM  (We read the file instead of calling /api/license/status because that
REM   endpoint requires an admin login — the file is credential-free.)
REM
REM  Send the printed line back to Lead via Zalo.
REM ===========================================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lic = Join-Path $env:APPDATA 'ops-control-desktop\license.json';" ^
  "if (-not (Test-Path $lic)) { Write-Host \"$env:COMPUTERNAME | NO-LICENSE-FILE | - | - | -  (app chua chay lan nao?)\"; Read-Host 'Nhan Enter de dong'; exit };" ^
  "$j = Get-Content $lic -Raw | ConvertFrom-Json;" ^
  "$type = if ($j.isTrial) { 'TRIAL' } elseif ($j.customer -eq 'UNLICENSED') { 'UNLICENSED' } else { 'REAL' };" ^
  "$days = [math]::Round(((Get-Date $j.expires_at) - (Get-Date)).TotalDays);" ^
  "Write-Host \"$env:COMPUTERNAME | $type | tier $($j.tier) | $($j.expires_at) | $days d\";" ^
  "if ($type -eq 'TRIAL') { Write-Host '>>> CANH BAO: may dang chay TRIAL - se KHOA khi het han. Bao Lead xin license that.' };" ^
  "if ($type -eq 'UNLICENSED') { Write-Host '>>> CANH BAO: che do UNLICENSED - KHONG duoc dung cho production.' };" ^
  "Read-Host 'Nhan Enter de dong'"
