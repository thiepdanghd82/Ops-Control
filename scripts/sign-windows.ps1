# sign-windows.ps1 — Self-signed code signing cho Windows installer
# ─────────────────────────────────────────────────────────────────────
#
# THAY THẾ EV Code Signing Cert (Sectigo ~290 USD/năm) BẰNG SELF-SIGNED
# CERT (miễn phí) + GPO push lên 50 máy nội bộ.
#
# Logic:
#   1. Lần đầu: tự sinh cert "CCL Design Vietnam Internal CA" trong
#      LocalMachine\My, export .pfx (cho signing) + .cer (cho IT GPO).
#   2. Mỗi lần build: load cert từ .pfx, sign installer .exe.
#   3. IT push .cer lên Computer\Trusted Publishers + Trusted Root CAs
#      qua GPO (tài liệu trong INTERNAL_TRUST_SETUP.md). Sau đó
#      SmartScreen sẽ KHÔNG cảnh báo trên 50 máy đã nhận GPO.
#
# Cert có hiệu lực 10 năm — IT chỉ cần generate 1 lần.
#
# Trade-off so với EV cert:
#   ✓ Free (vs $290/year)
#   ✓ Không bị Sectigo backlog 1-2 tuần
#   ✗ User ngoài 50 máy GPO sẽ thấy SmartScreen warning
#     (acceptable vì app này internal-only — không phân phối public)
#   ✗ Không có "instant reputation" như EV cert (nhưng GPO trust
#     bypass SmartScreen luôn, không cần reputation)
#
# Usage (chạy trên máy build Windows):
#   pwsh -File scripts/sign-windows.ps1 -InstallerPath "dist-electron/Ops-Control-Setup-1.1.0.exe"
#
# Hoặc với cert path tùy chỉnh:
#   pwsh -File scripts/sign-windows.ps1 -InstallerPath "..." -CertPath "C:\certs\ops.pfx" -CertPassword "<pwd>"

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$InstallerPath,

  [string]$CertPath = "$PSScriptRoot/../desktop/build/internal-cert.pfx",
  [string]$CertPassword = $env:OPS_CERT_PASSWORD,
  [string]$CertExportPath = "$PSScriptRoot/../desktop/build/internal-cert.cer",
  [string]$Subject = "CCL Design Vietnam - Ops Control",
  [int]$ValidYears = 10
)

$ErrorActionPreference = 'Stop'

Write-Host "═══ Ops Control — Windows code signing ═══" -ForegroundColor Cyan
Write-Host "Installer: $InstallerPath"

if (-not (Test-Path $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

# ─── Step 1: Ensure .pfx exists ───────────────────────────────────────
if (-not (Test-Path $CertPath)) {
  Write-Host "[1/3] No cert at $CertPath — generating self-signed…" -ForegroundColor Yellow

  if ([string]::IsNullOrEmpty($CertPassword)) {
    Write-Host "  No CertPassword — generating random one (save it for next builds!)" -ForegroundColor Yellow
    Add-Type -AssemblyName System.Web
    $CertPassword = [System.Web.Security.Membership]::GeneratePassword(24, 4)
    Write-Host "  Generated: $CertPassword" -ForegroundColor Green
    Write-Host "  → Set this as OPS_CERT_PASSWORD env var for future builds" -ForegroundColor Yellow
  }

  # New-SelfSignedCertificate is built into Windows 10+, no extra deps
  $cert = New-SelfSignedCertificate `
    -Subject "CN=$Subject, O=CCL Design Vietnam, C=VN" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -Type CodeSigningCert `
    -KeyAlgorithm RSA `
    -KeyLength 4096 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears($ValidYears) `
    -KeySpec Signature

  Write-Host "  ✓ Created cert thumbprint: $($cert.Thumbprint)" -ForegroundColor Green

  # Export PFX (for signing)
  $pwdSecure = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
  Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
                         -FilePath $CertPath `
                         -Password $pwdSecure `
                         | Out-Null
  Write-Host "  ✓ Exported PFX: $CertPath" -ForegroundColor Green

  # Export CER (for GPO Trusted Publishers — share this with IT)
  Export-Certificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
                     -FilePath $CertExportPath `
                     -Type CERT `
                     | Out-Null
  Write-Host "  ✓ Exported CER (for GPO push): $CertExportPath" -ForegroundColor Green
  Write-Host ""
  Write-Host "  NEXT: Send $CertExportPath to IT để push qua GPO." -ForegroundColor Cyan
  Write-Host "        Xem hướng dẫn: docs/INTERNAL_TRUST_SETUP.md"   -ForegroundColor Cyan
  Write-Host ""
}
else {
  Write-Host "[1/3] Loading existing cert: $CertPath" -ForegroundColor Green
  if ([string]::IsNullOrEmpty($CertPassword)) {
    throw "CertPassword required (set env var OPS_CERT_PASSWORD or pass -CertPassword)."
  }
}

# ─── Step 2: Load cert ─────────────────────────────────────────────────
Write-Host "[2/3] Loading PFX into memory…"
$pwdSecure = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
$cert = Get-PfxCertificate -FilePath $CertPath -Password $pwdSecure
Write-Host "  ✓ Subject: $($cert.Subject)"
Write-Host "  ✓ Expires: $($cert.NotAfter)"

# ─── Step 3: Sign installer with timestamp ─────────────────────────────
# Timestamp server giúp signature vẫn valid SAU khi cert expire — quan
# trọng cho long-lived installers. Ta dùng DigiCert free timestamp server.
Write-Host "[3/3] Signing $InstallerPath…"
$signResult = Set-AuthenticodeSignature `
  -FilePath $InstallerPath `
  -Certificate $cert `
  -HashAlgorithm SHA256 `
  -TimestampServer "http://timestamp.digicert.com" `
  -IncludeChain All

if ($signResult.Status -ne 'Valid') {
  throw "Signing failed: $($signResult.StatusMessage)"
}
Write-Host "  ✓ Signed — status: $($signResult.Status)" -ForegroundColor Green
Write-Host "  ✓ Signer: $($signResult.SignerCertificate.Subject)"

# Verify
Write-Host ""
Write-Host "═══ Done ═══" -ForegroundColor Cyan
Write-Host "Verify: signtool verify /v /pa `"$InstallerPath`""
Write-Host "GPO push: docs/INTERNAL_TRUST_SETUP.md"
