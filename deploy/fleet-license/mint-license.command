#!/bin/bash
# ───────────────────────────────────────────────────────────────────────────
# mint-license.command — OFFLINE license minting (máy Lead only)
#
# DOUBLE-CLICK to run. Hỏi từng thông tin → ký license bằng KEY OFFLINE
# (~/OpsControl-license-keys/prod-private.pem) → tự verify → in hướng dẫn gửi
# operator.
#
# NGUYÊN TẮC: private key KHÔNG BAO GIỜ vào repo/app/server. Script này chỉ
# CHẠY trên máy Lead nơi có key offline. App không bao giờ tự ký.
# ───────────────────────────────────────────────────────────────────────────
set -uo pipefail

KEY="$HOME/OpsControl-license-keys/prod-private.pem"
OUTDIR="$HOME/OpsControl-license-keys/issued"
# Site name as it appears on the licence card in Settings -> About. Changed
# 2026-09-21 (Henry): the customer is Hai Phong. Every licence minted before
# that date says Yen Phong and keeps saying it -- `customer` is a SIGNED
# field, so an existing licence cannot be corrected by editing the JSON; it
# has to be re-minted here and re-issued to that machine.
CUSTOMER="CCL Design Vietnam — Hai Phong"

# Resolve repo dir. _SALVAGE/ ships in two layouts and the arithmetic differs:
#   anh em  — <parent>/_SALVAGE/fleet-audit  cạnh  <parent>/Ops-Control   → ../../Ops-Control
#   lồng    — <repo>/_SALVAGE/fleet-audit    bên trong chính repo         → ../..
# Dò cả hai và chỉ nhận thư mục thật sự chứa script mint, nên không thể vớ nhầm.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="${OPS_REPO:-}"
if [ -z "$REPO" ]; then
  for CAND in "$SCRIPT_DIR/../../Ops-Control" "$SCRIPT_DIR/../.."; do
    if [ -f "$CAND/scripts/license/generate-license.mjs" ]; then
      REPO="$(cd "$CAND" && pwd)"
      break
    fi
  done
fi

die() { echo ""; echo "✘ $1"; echo ""; read -r -p "Nhấn Enter để đóng..." _; exit 1; }

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  OpsControl — Mint license (offline, máy Lead)"
echo "════════════════════════════════════════════════════════════"

# ── Preconditions ──────────────────────────────────────────────────────────
# Node có thể không nằm trong PATH khi chạy qua double-click — tự dò các vị trí quen.
if ! command -v node >/dev/null 2>&1; then
  for NODE_DIR in "$HOME/.local/node24/bin" /opt/homebrew/bin /usr/local/bin \
                  "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$NODE_DIR/node" ]; then PATH="$NODE_DIR:$PATH"; export PATH; break; fi
  done
fi
command -v node >/dev/null 2>&1 || die "Không tìm thấy Node (đã dò ~/.local/node24, Homebrew, nvm). Cài Node 20+ rồi chạy lại."
[ -f "$KEY" ] || die "Không thấy private key offline tại: $KEY
   (Đây là máy Lead chứ? Key phải nằm offline, không trong repo.)"
[ -n "$REPO" ] && [ -f "$REPO/scripts/license/generate-license.mjs" ] || \
  die "Không tìm thấy repo Ops-Control. Đặt biến OPS_REPO=<đường dẫn repo> rồi chạy lại."

# ── Prompts ────────────────────────────────────────────────────────────────
read -r -p "1) Installation ID (64 ký tự hex, bỏ space): " INSTALL_ID
INSTALL_ID="$(echo "$INSTALL_ID" | tr -d '[:space:]')"
echo "$INSTALL_ID" | grep -Eq '^[0-9a-fA-F]{64}$' || \
  die "Installation ID sai format. Phải đúng 64 ký tự hex (0-9 a-f). Nhận được ${#INSTALL_ID} ký tự."

read -r -p "2) Tên operator / máy (vd: mpham, op3): " OPERATOR
OPERATOR="$(echo "$OPERATOR" | tr -cd '[:alnum:]_-')"
[ -n "$OPERATOR" ] || die "Tên operator trống."

read -r -p "3) Loại máy (mac/win) [mac]: " PLATFORM
PLATFORM="${PLATFORM:-mac}"
[ "$PLATFORM" = "mac" ] || [ "$PLATFORM" = "win" ] || die "Loại máy phải là 'mac' hoặc 'win'."

read -r -p "4) Hết hạn YYYY-MM-DD [2027-06-09]: " EXPIRES
EXPIRES="${EXPIRES:-2027-06-09}"
echo "$EXPIRES" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || die "Ngày hết hạn sai format YYYY-MM-DD."

read -r -p "5) Tier (S/M/L) [M]: " TIER
TIER="$(echo "${TIER:-M}" | tr '[:lower:]' '[:upper:]')"
echo "$TIER" | grep -Eq '^[SML]$' || die "Tier phải là S, M, hoặc L."

# ── Mint ───────────────────────────────────────────────────────────────────
mkdir -p "$OUTDIR"
OUT="$OUTDIR/$(date +%F)-$PLATFORM-$OPERATOR.json"

echo ""
echo "→ Ký license offline…"
node "$REPO/scripts/license/generate-license.mjs" \
  --installation-id "$INSTALL_ID" \
  --customer "$CUSTOMER" \
  --tier "$TIER" \
  --expires "$EXPIRES" \
  --key "$KEY" \
  --out "$OUT" || die "Mint thất bại (xem lỗi ở trên)."

# ── Self-verify with the REAL embedded pubkey (server verifier) ─────────────
echo "→ Verify chữ ký bằng pubkey embedded (verifier thật)…"
VERIFY=$(cd "$REPO" && OPS_LICENSE_FILE="$OUT" node --input-type=module -e '
import { getLicense } from "./server/services/licenseService.js";
const r = getLicense();
if (r.ok) { console.log("OK", r.license.tier, r.license.max_users, r.license.expires_at); }
else { console.log("FAIL", r.reason); process.exit(2); }
' 2>&1)
if echo "$VERIFY" | grep -q '^OK'; then
  echo "  ✅ Chữ ký HỢP LỆ với pubkey embedded mới — $VERIFY"
else
  die "Verify THẤT BẠI: $VERIFY
   (Pubkey embedded không khớp key offline? Kiểm tra rotation đã merge vào repo chưa.)"
fi

# ── Operator instructions ──────────────────────────────────────────────────
if [ "$PLATFORM" = "mac" ]; then
  DEST="~/Library/Application Support/ops-control-desktop/license.json"
else
  DEST="%APPDATA%\\ops-control-desktop\\license.json"
fi
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  License đã ký: $OUT"
echo "════════════════════════════════════════════════════════════"
echo "Gửi operator 3 bước (kèm file license trên qua Zalo):"
echo "  1) Cài bản DMG/EXE MỚI nhất TRƯỚC (bản có pubkey mới)."
echo "  2) Đổi tên file vừa nhận thành 'license.json', copy đè vào:"
echo "       $DEST"
echo "  3) Mở (hoặc mở lại) app Ops Control — banner license biến mất."
echo ""
echo "⚠️  Đừng quên: cập nhật registry docs/operations/licenses/ — chỉ metadata"
echo "    (installation_id/tier/expires/issued_at), signature để REDACTED, KHÔNG"
echo "    commit file license đầy đủ. Bản full giữ offline trong ~/OpsControl-license-keys/."
echo ""
read -r -p "Nhấn Enter để đóng..." _
