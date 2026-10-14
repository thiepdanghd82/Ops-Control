<#
.SYNOPSIS
    Install Ops Control SERVER as a Windows scheduled task — auto-start at
    logon + restart on failure.

.DESCRIPTION
    Discovers the installed Ops Control SERVER executable, renders the
    OpsControlServer.Task.xml template with that path, and registers it
    with Task Scheduler. Idempotent: re-running replaces the task.

.PARAMETER AppPath
    Override the auto-discovered app path. Useful if installed to a
    non-default location.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install-windows.ps1
    powershell -ExecutionPolicy Bypass -File install-windows.ps1 -AppPath "D:\OpsControl\Ops Control.exe"
#>
param(
    [string]$AppPath = $null
)

$ErrorActionPreference = "Stop"
$TaskName = "OpsControlServer"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Template = Join-Path $ScriptDir "OpsControlServer.Task.xml"

if (-not (Test-Path $Template)) {
    Write-Error "Template not found: $Template"
    exit 1
}

# 1. Discover the installer-deployed app path if not overridden
if (-not $AppPath) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Ops Control\Ops Control.exe",
        "$env:ProgramFiles\Ops Control\Ops Control.exe",
        "${env:ProgramFiles(x86)}\Ops Control\Ops Control.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $AppPath = $c
            break
        }
    }
}

if (-not $AppPath -or -not (Test-Path $AppPath)) {
    Write-Error "Ops Control SERVER app not found. Install the SERVER setup .exe first, or pass -AppPath explicitly."
    exit 1
}

Write-Host "Using app path: $AppPath"

# 2. Render template
$xml = Get-Content -Raw -Path $Template
$xml = $xml -replace "__APP_PATH__", [System.Security.SecurityElement]::Escape($AppPath)

$RenderedPath = Join-Path $env:TEMP "OpsControlServer.Task.rendered.xml"
Set-Content -Path $RenderedPath -Value $xml -Encoding Unicode

# 3. Remove pre-existing registration (idempotency)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing pre-existing task '$TaskName'..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# 4. Register new task
Register-ScheduledTask -TaskName $TaskName -Xml (Get-Content -Raw -Path $RenderedPath) -User $env:USERNAME | Out-Null

# 5. Verify
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host ""
Write-Host "✓ Scheduled task installed: $($task.TaskName)"
Write-Host "  State: $($task.State)"
Write-Host "  Trigger: AtLogon (any user)"
Write-Host "  Restart on failure: 3 attempts, 1-minute interval"
Write-Host ""
Write-Host "Test (will launch the app NOW + verify):"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Get-Process 'Ops Control'  # should show running process"
Write-Host ""
Write-Host "⚠ Reminder: enable auto-login (netplwiz → uncheck 'Users must enter"
Write-Host "  a user name and password to use this computer') so the task triggers"
Write-Host "  after power-loss reboot without operator intervention."

Remove-Item -Path $RenderedPath -Force -ErrorAction SilentlyContinue
