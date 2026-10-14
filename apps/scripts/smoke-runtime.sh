#!/usr/bin/env bash
#
# smoke-runtime.sh — post-install end-to-end smoke test for v1.3 features.
#
# READ-ONLY — never kills processes, never sends signals. All it does is
# curl GET against the running server. Safe to run while users are
# actively logged in. (An earlier dev iteration paired this with a
# `kill $(lsof -t -iTCP:3100)` cleanup which would unintentionally kill
# the desktop app's embedded server. That cleanup has been removed.)
#
# Run this AFTER the desktop app is installed and at least one user has
# logged in (so the auth/online status pieces have data to report).
# Verifies:
#   - /health responds 200
#   - /api/events/status reports SSE infra alive
#   - /api/users/status returns the user list (auth → 401 expected w/o creds)
#   - /api/shared/admin/quotes-backend reports current backend
#   - /api/backup/list responds (auth-gated → 401 w/o creds)
#   - SSE /api/events/stream auth-gates correctly (returns 401 w/o token)
#
# Usage:
#   ./scripts/smoke-runtime.sh                     # default http://127.0.0.1:3100
#   ./scripts/smoke-runtime.sh http://192.168.1.16:3100
#   OPS_TOKEN=<token> ./scripts/smoke-runtime.sh   # uses token for authed endpoints

set -o pipefail

HOST="${1:-http://127.0.0.1:3100}"
HOST="${HOST%/}"
TOKEN="${OPS_TOKEN:-}"

# Use $'...' so bash interprets \033 as literal ESC at parse time;
# printf %s would otherwise emit the four chars '\033'.
GREEN=$'\033[32m'
RED=$'\033[31m'
YELLOW=$'\033[33m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"; shift
  local expected="$1"; shift
  local actual="$1"; shift
  local detail="${1:-}"
  if [[ "$actual" == "$expected" ]]; then
    printf "  ${GREEN}✓${RESET} %-40s ${GREEN}%s${RESET}\n" "$label" "$actual"
    PASS=$((PASS + 1))
  else
    printf "  ${RED}✗${RESET} %-40s expected=%s got=%s %s\n" "$label" "$expected" "$actual" "$detail"
    FAIL=$((FAIL + 1))
  fi
}

warn() {
  local label="$1"; shift
  local msg="$*"
  printf "  ${YELLOW}!${RESET} %-40s ${YELLOW}%s${RESET}\n" "$label" "$msg"
  WARN=$((WARN + 1))
}

curl_status() {
  curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$@" 2>/dev/null || echo "000"
}

curl_body() {
  curl -sS --max-time 5 "$@" 2>/dev/null || echo ""
}

echo
echo "${BOLD}═══ Ops Control v1.3 Runtime Smoke Test ═══${RESET}"
echo "  target: $HOST"
[[ -n "$TOKEN" ]] && echo "  token: ${TOKEN:0:8}…" || echo "  token: (none — auth-gated checks will show 401)"
echo

# ── Public endpoints (no auth needed) ───────────────────────────────
echo "${BOLD}Public endpoints${RESET}"
check "/health"                  "200" "$(curl_status "$HOST/health")"
check "/api/health (alias)"      "200" "$(curl_status "$HOST/api/health")"

# /assets/* should return 404 for missing chunks (regression guard from
# the 2026-04-23 stale-chunk crash). 200 here means SPA catch-all is
# serving HTML for missing JS — would crash with MIME error.
check "/assets/MISSING.js → 404" "404" "$(curl_status "$HOST/assets/THIS-DOES-NOT-EXIST-$(date +%s).js")"

# ── Auth-gated endpoints — without token expect 401 ─────────────────
echo
echo "${BOLD}Auth gates (expect 401 without token)${RESET}"
H_AUTH=()
if [[ -n "$TOKEN" ]]; then
  H_AUTH=(-H "Authorization: Bearer $TOKEN")
  EXPECTED="200"
else
  EXPECTED="401"
fi
check "/api/events/status"        "$EXPECTED" "$(curl_status "${H_AUTH[@]}" "$HOST/api/events/status")"
check "/api/events/stream"        "$EXPECTED" "$(curl_status "${H_AUTH[@]}" "$HOST/api/events/stream")"
check "/api/users/status"         "$EXPECTED" "$(curl_status "${H_AUTH[@]}" "$HOST/api/users/status")"
check "/api/backup/list"          "$EXPECTED" "$(curl_status "${H_AUTH[@]}" "$HOST/api/backup/list")"
check "/api/shared/admin/quotes-backend" "$EXPECTED" "$(curl_status "${H_AUTH[@]}" "$HOST/api/shared/admin/quotes-backend")"

# ── Authed deep checks (only if token provided) ─────────────────────
if [[ -n "$TOKEN" ]]; then
  echo
  echo "${BOLD}Authed deep checks${RESET}"

  # Quote backend report
  BODY=$(curl_body "${H_AUTH[@]}" "$HOST/api/shared/admin/quotes-backend")
  BACKEND=$(echo "$BODY" | grep -o '"backend":"[^"]*"' | head -1 | cut -d'"' -f4)
  SQLCNT=$(echo "$BODY" | grep -o '"sqlite_count":[0-9]*' | head -1 | cut -d: -f2)
  FILECNT=$(echo "$BODY" | grep -o '"file_count":[0-9]*' | head -1 | cut -d: -f2)
  if [[ -n "$BACKEND" ]]; then
    printf "  ${GREEN}✓${RESET} %-40s backend=%s sqlite=%s file=%s\n" \
      "Quote backend report" "$BACKEND" "${SQLCNT:-?}" "${FILECNT:-?}"
    PASS=$((PASS + 1))
    if [[ -n "$SQLCNT" && -n "$FILECNT" && "$SQLCNT" != "$FILECNT" ]]; then
      warn "  parity mismatch" "sqlite ($SQLCNT) ≠ file ($FILECNT) — run a /save-all to resync"
    fi
  else
    fail "Quote backend report" "no body" "(check token validity)"
  fi

  # SSE subscriber count
  BODY=$(curl_body "${H_AUTH[@]}" "$HOST/api/events/status")
  SUBS=$(echo "$BODY" | grep -o '"subscribers":[0-9]*' | head -1 | cut -d: -f2)
  if [[ -n "$SUBS" ]]; then
    printf "  ${GREEN}✓${RESET} %-40s %s subscriber(s)\n" "SSE event stream" "$SUBS"
    PASS=$((PASS + 1))
  else
    warn "SSE event stream" "could not parse subscriber count"
  fi

  # Online users count
  BODY=$(curl_body "${H_AUTH[@]}" "$HOST/api/users/status")
  ONLINE=$(echo "$BODY" | grep -o '"online":true' | wc -l | tr -d ' ')
  TOTAL=$(echo "$BODY" | grep -o '"id":' | wc -l | tr -d ' ')
  printf "  ${GREEN}✓${RESET} %-40s %s online / %s total\n" "Active users" "$ONLINE" "$TOTAL"
  PASS=$((PASS + 1))
fi

# ── Summary ─────────────────────────────────────────────────────────
echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "${BOLD}${GREEN}═══ PASS ═══${RESET} $PASS check(s) green${WARN:+, $WARN warning(s)}"
  exit 0
else
  echo "${BOLD}${RED}═══ FAIL ═══${RESET} $FAIL failure(s), $PASS pass${WARN:+, $WARN warning(s)}"
  exit 1
fi
