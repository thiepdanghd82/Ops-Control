# Ops-Control pre-release audit (Windows). Chạy từ gốc repo: .\audit\run-audit.ps1
# Cần: Node/npm; semgrep (pip install semgrep) tuỳ chọn; gitleaks (scoop install gitleaks) tuỳ chọn.
$ErrorActionPreference = 'Continue'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root
$env:SEMGREP_SEND_METRICS = 'off'
$Ts  = Get-Date -Format 'yyyyMMdd-HHmmss'
$Out = Join-Path $Root "audit\reports\$Ts"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$ScanDirs = @('server','client/src','desktop','scripts')
$Excl = @('--exclude','node_modules','--exclude','dist','--exclude','dist-electron','--exclude','build','--exclude','*.test.js','--exclude','*.test.mjs')
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "`n== 1/5 npm audit =="
foreach ($d in @('.','client','desktop')) {
  $name = Split-Path (Resolve-Path $d) -Leaf
  Push-Location $d
  npm audit --omit=dev --audit-level=high *> (Join-Path $Out "npm-audit-$name.txt")
  Write-Host "  $name : exit $LASTEXITCODE (0 = sạch)"
  Pop-Location
}
if (Test-Path scripts/check-security-allowlist.mjs) { node scripts/check-security-allowlist.mjs *> (Join-Path $Out 'allowlist-check.txt') }

Write-Host "`n== 2/5 Secrets =="
if (Have gitleaks) {
  gitleaks detect --source . --no-banner --report-format csv --report-path (Join-Path $Out 'gitleaks.csv') | Out-Null
  Write-Host "  gitleaks exit $LASTEXITCODE (0 = sạch)"
} else {
  Write-Host "  gitleaks không cài – dùng grep cơ bản"
  $pat = 'AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|(password|secret|api_key|token)"?\s*[:=]\s*"[^"]{8,}'
  Get-ChildItem -Recurse -Include *.js,*.mjs,*.json,.env* -File |
    Where-Object { $_.FullName -notmatch '\\(node_modules|dist|audit)\\' } |
    Select-String -Pattern $pat | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" } |
    Set-Content (Join-Path $Out 'secrets-grep.txt')
}
git ls-files | Select-String -Pattern '(^|/)\.env$|users\.json|\.db$|\.sqlite3?$|\.pem$|\.key$' | ForEach-Object { $_.Line } | Set-Content (Join-Path $Out 'tracked-sensitive.txt')

Write-Host "`n== 3/5 Semgrep =="
if (Have semgrep) {
  semgrep --metrics=off --config audit/rules/ops-control.yml @Excl --quiet --json -o (Join-Path $Out 'semgrep-custom.json') @ScanDirs 2>> (Join-Path $Out 'semgrep.err')
  semgrep --metrics=off --config p/nodejs --config p/javascript --config p/electron --config p/owasp-top-ten --config p/secrets @Excl --quiet --json -o (Join-Path $Out 'semgrep-registry.json') @ScanDirs 2>> (Join-Path $Out 'semgrep.err')
  if ($LASTEXITCODE -ne 0) { Write-Host "  registry rules: bỏ qua (offline?)" }
} else { Write-Host "  semgrep chưa cài: pip install semgrep" }

Write-Host "`n== 4/5 Electronegativity =="
npx --yes @doyensec/electronegativity -i desktop -o (Join-Path $Out 'electronegativity.csv') -s medium 2> (Join-Path $Out 'electronegativity.err') | Out-Null

Write-Host "`n== 5/5 Tổng hợp =="
node (Join-Path $Root 'audit\summarize.mjs') $Out | Tee-Object -FilePath (Join-Path $Out 'SUMMARY.md')
Write-Host "`nBáo cáo: $Out"
