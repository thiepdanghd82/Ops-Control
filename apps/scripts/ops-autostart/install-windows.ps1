<#
.SYNOPSIS
    Install Quoted Module SERVER as a Windows scheduled task — auto-start at
    logon + restart on failure.

.DESCRIPTION
    Discovers the installed Quoted Module SERVER executable (or, on a machine
    installed before the rename, the Ops Control one), renders the
    OpsControlServer.Task.xml template with that path, and registers it
    with Task Scheduler. Idempotent: re-running replaces the task.

.PARAMETER AppPath
    Override the auto-discovered app path. Useful if installed to a
    non-default location.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install-windows.ps1
    powershell -ExecutionPolicy Bypass -File install-windows.ps1 -AppPath "D:\QuotedModule\Quoted Module.exe"
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
    # The app was renamed from "Ops Control": look for the new name first,
    # then the old one so a machine that has not been upgraded yet installs.
    # An install upgraded in place keeps its old folder with the new exe in
    # it — flat after a silent update, nested after an interactive one.
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Quoted Module\Quoted Module.exe",
        "$env:ProgramFiles\Quoted Module\Quoted Module.exe",
        "${env:ProgramFiles(x86)}\Quoted Module\Quoted Module.exe",
        "$env:LOCALAPPDATA\Programs\Ops Control\Quoted Module.exe",
        "$env:ProgramFiles\Ops Control\Quoted Module.exe",
        "${env:ProgramFiles(x86)}\Ops Control\Quoted Module.exe",
        "$env:LOCALAPPDATA\Programs\Ops Control\Quoted Module\Quoted Module.exe",
        "$env:ProgramFiles\Ops Control\Quoted Module\Quoted Module.exe",
        "${env:ProgramFiles(x86)}\Ops Control\Quoted Module\Quoted Module.exe",
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
    Write-Error "Quoted Module SERVER app not found. Install the SERVER setup .exe first, or pass -AppPath explicitly."
    exit 1
}

Write-Host "Using app path: $AppPath"
# Process name = executable name ("Quoted Module", or "Ops Control" before the rename).
$ProcName = [System.IO.Path]::GetFileNameWithoutExtension($AppPath)

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
Write-Host "  Get-Process '$ProcName'  # should show running process"
Write-Host ""
Write-Host "⚠ Reminder: enable auto-login (netplwiz → uncheck 'Users must enter"
Write-Host "  a user name and password to use this computer') so the task triggers"
Write-Host "  after power-loss reboot without operator intervention."

Remove-Item -Path $RenderedPath -Force -ErrorAction SilentlyContinue
