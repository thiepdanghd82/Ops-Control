<#
.SYNOPSIS
    Remove the Quoted Module SERVER scheduled task. Auto-start +
    auto-restart stop; the app itself is untouched.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File uninstall-windows.ps1
#>

$ErrorActionPreference = "Stop"
$TaskName = "OpsControlServer"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "✓ Nothing to do — task '$TaskName' not registered."
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "✓ Scheduled task removed: $TaskName"
Write-Host ""
Write-Host "Note: the Quoted Module SERVER app itself is untouched. Quit it"
Write-Host "manually if you want it to stop now:"
Write-Host "  Stop-Process -Name 'Quoted Module' -Force   # 'Ops Control' on an install from before the rename"
