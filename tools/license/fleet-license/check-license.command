#!/bin/bash
# ───────────────────────────────────────────────────────────────────────────
# check-license.command — OpsControl fleet license audit (macOS)
#
# DOUBLE-CLICK to run. No install needed. Prints ONE status line:
#   hostname | type | tier | expires_at | days-left
#
# It reads the desktop license file directly:
#   ~/Library/Application Support/ops-control-desktop/license.json
# (We read the file instead of calling /api/license/status because that
#  endpoint requires an admin login — the file is credential-free.)
#
# Send the printed line back to Lead via Zalo.
# ───────────────────────────────────────────────────────────────────────────

LIC="$HOME/Library/Application Support/ops-control-desktop/license.json"
HOST=$(hostname)

echo ""
echo "OpsControl license check — $HOST"
echo "------------------------------------------------------------"

if [ ! -f "$LIC" ]; then
  echo "$HOST | NO-LICENSE-FILE | - | - | -   (app chưa chạy lần nào?)"
  echo ""
  read -r -p "Nhấn Enter để đóng..." _
  exit 0
fi

# Anchor on the key name so colons inside ISO timestamps aren't eaten by a
# greedy `.*:` (e.g. expires_at "2026-06-08T06:23:04.864Z").
get() { grep -m1 "\"$1\"" "$LIC" | sed -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"?([^\",]*)\"?.*/\1/"; }

if grep -m1 '"isTrial"' "$LIC" | grep -q true; then TYPE="TRIAL"; else TYPE="REAL"; fi
CUSTOMER=$(get customer)
[ "$CUSTOMER" = "UNLICENSED" ] && TYPE="UNLICENSED"
TIER=$(get tier)
EXPIRES=$(get expires_at)

# Strip fractional seconds + trailing Z so BSD `date` can parse the ISO stamp.
EXP_CLEAN=$(echo "$EXPIRES" | sed -E 's/\.[0-9]+//; s/Z$//')
EXP_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$EXP_CLEAN" "+%s" 2>/dev/null)
NOW=$(date "+%s")
if [ -n "$EXP_EPOCH" ]; then DAYS=$(( (EXP_EPOCH - NOW) / 86400 )); else DAYS="?"; fi

echo "$HOST | $TYPE | tier $TIER | $EXPIRES | ${DAYS}d"
[ "$TYPE" = "TRIAL" ] && echo ">>> CẢNH BÁO: máy đang chạy TRIAL — sẽ KHÓA khi hết hạn. Báo Lead xin license thật."
[ "$TYPE" = "UNLICENSED" ] && echo ">>> CẢNH BÁO: chế độ UNLICENSED — KHÔNG được dùng cho production."
echo ""
read -r -p "Nhấn Enter để đóng..." _
