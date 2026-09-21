#!/usr/bin/env bash
# Ops-Control pre-release audit. Chạy từ gốc repo: ./audit/run-audit.sh
# Không sửa code, chỉ đọc. Kết quả: audit/reports/<timestamp>/
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"
export SEMGREP_SEND_METRICS=off
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/audit/reports/$TS"
mkdir -p "$OUT"
SCAN_DIRS="server client/src desktop scripts"
EXCL=(--exclude node_modules --exclude dist --exclude dist-electron --exclude build --exclude '*.test.js' --exclude '*.test.mjs')
say() { printf '\n== %s ==\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "1/5 npm audit (root, client, desktop) – chỉ production deps"
for d in . client desktop; do
  name=$(basename "$(cd "$d" && pwd)")
  (cd "$d" && npm audit --omit=dev --audit-level=high > "$OUT/npm-audit-$name.txt" 2>&1)
  echo "  $name: exit $? (0 = sạch)"
done
[ -f scripts/check-security-allowlist.mjs ] && node scripts/check-security-allowlist.mjs > "$OUT/allowlist-check.txt" 2>&1 && echo "  allowlist: OK" || echo "  allowlist: xem $OUT/allowlist-check.txt"

say "2/5 Secrets"
if have gitleaks; then
  gitleaks detect --source . --no-banner --report-format csv --report-path "$OUT/gitleaks.csv" >/dev/null 2>&1
  echo "  gitleaks: exit $? (0 = sạch), báo cáo $OUT/gitleaks.csv"
else
  echo "  gitleaks không cài – dùng grep cơ bản"
  grep -rInE --include='*.js' --include='*.mjs' --include='*.json' --include='*.env*' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=audit \
    -e 'AKIA[0-9A-Z]{16}' -e 'sk-[A-Za-z0-9]{20,}' -e 'ghp_[A-Za-z0-9]{30,}' \
    -e '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY' -e '(password|secret|api_key|token)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"']{8,}' \
    . > "$OUT/secrets-grep.txt" 2>/dev/null
  echo "  $(wc -l < "$OUT/secrets-grep.txt") dòng nghi ngờ -> $OUT/secrets-grep.txt"
fi
echo "  File nhạy cảm có bị git theo dõi không:"
git ls-files | grep -E '(^|/)\.env$|users\.json|\.db$|\.sqlite3?$|\.pem$|\.key$' > "$OUT/tracked-sensitive.txt"
[ -s "$OUT/tracked-sensitive.txt" ] && { echo "  !! CÓ:"; cat "$OUT/tracked-sensitive.txt"; } || echo "  không (tốt)"

say "3/5 Semgrep"
if have semgrep; then
  # rule riêng (offline, luôn chạy được)
  timeout 600 semgrep --metrics=off --config audit/rules/ops-control.yml "${EXCL[@]}" --quiet \
    --json -o "$OUT/semgrep-custom.json" $SCAN_DIRS 2>>"$OUT/semgrep.err"
  # rule cộng đồng (cần mạng tới semgrep.dev; bỏ qua nếu offline)
  if timeout 900 semgrep --metrics=off --config p/nodejs --config p/javascript --config p/electron \
       --config p/owasp-top-ten --config p/secrets "${EXCL[@]}" --quiet \
       --json -o "$OUT/semgrep-registry.json" --sarif-output="$OUT/semgrep.sarif" $SCAN_DIRS 2>>"$OUT/semgrep.err"; then
    echo "  registry rules: OK"
  else
    echo "  registry rules: bỏ qua (không có mạng hoặc lỗi – xem semgrep.err)"
  fi
else
  echo "  semgrep chưa cài: pip3 install semgrep"
fi

say "4/5 Electronegativity (cấu hình Electron)"
if have npx; then
  timeout 300 npx --yes @doyensec/electronegativity -i desktop -o "$OUT/electronegativity.csv" -s medium >/dev/null 2>"$OUT/electronegativity.err" \
    && echo "  OK -> electronegativity.csv" || echo "  bỏ qua/lỗi (xem electronegativity.err)"
fi

say "5/5 Tổng hợp"
python3 "$ROOT/audit/summarize.py" "$OUT" > "$OUT/SUMMARY.md" 2>/dev/null || node "$ROOT/audit/summarize.mjs" "$OUT" > "$OUT/SUMMARY.md"
cat "$OUT/SUMMARY.md"
echo
echo "Báo cáo đầy đủ: $OUT"
echo "Bước tiếp theo: mở audit/CHECKLIST.md và đánh dấu mục kiểm tra tay."
