#!/bin/bash
# ───────────────────────────────────────────────────────────────────────────
# ops-server-install-daemon.command — cài Ops Control SERVER chạy nền (macOS)
#
# DOUBLE-CLICK để cài. Server sẽ:
#   • tự khởi động cùng máy (trước khi ai login)
#   • chạy ngầm, không cửa sổ, không cần mở app
#   • tự restart khi crash (KeepAlive)
#
# Mọi lệnh cần quyền admin được IN RA trước khi chạy (minh bạch). Cài 1 lần;
# quản lý sau bằng ops-server-{status,start,stop,uninstall}.command.
# ───────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"
source "$(dirname "$0")/_common.sh"

echo "════════════════════════════════════════════════════════════"
echo "  Cài Ops Control SERVER dạng dịch vụ nền (LaunchDaemon)"
echo "════════════════════════════════════════════════════════════"

# Ghi nhớ user gọi (để di trú license/data từ profile của họ sau khi lên root)
INVOKING_USER="${SUDO_USER:-$(id -un)}"
need_root "$@"

# ── 1. Kiểm tra app đã cài ──────────────────────────────────────────────────
echo ""
echo "[1/7] Kiểm tra app đã cài…"
if [ ! -x "$ELECTRON_BIN" ] || [ ! -f "$SERVER_ENTRY" ]; then
  echo "  ✘ Không thấy app tại: $APP"
  echo "    Cài bản 'Ops Control SERVER ….dmg' vào /Applications trước (kéo vào Applications)."
  echo "    Nếu app ở chỗ khác: chạy lại với  OPS_APP=/duong/dan/App.app  trước lệnh."
  pause_close; exit 1
fi
echo "  ✓ App: $APP"

# ── 2. Tạo thư mục hệ thống ──────────────────────────────────────────────────
echo ""
echo "[2/7] Tạo thư mục dữ liệu + log hệ thống…"
run mkdir -p "$DATA_DIR" "$LOG_DIR"
run chmod 755 "$SUPPORT_DIR"

# ── 3. Sinh khóa (1 lần) + ghi server.env (chmod 600) ───────────────────────
echo ""
echo "[3/7] Cấu hình env + khóa bí mật (server.env, chỉ root đọc)…"
gen_key() { ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
if [ -f "$ENV_FILE" ]; then
  echo "  ✓ Giữ nguyên server.env đã có (không sinh lại khóa — tránh khóa người dùng khỏi 2FA)."
else
  echo "  → Sinh OPS_TOTP_KEY / OPS_KIOSK_KEY / OPS_EXPORT_HMAC_KEY (64-hex)…"
  TOTP_KEY="$(gen_key)"; KIOSK_KEY="$(gen_key)"; HMAC_KEY="$(gen_key)"
  umask 077
  cat > "$ENV_FILE" <<ENV
# Ops Control headless SERVER — env (chmod 600, chỉ root). KHÔNG commit.
NODE_ENV=production
OPS_PORT=${PORT}
PORT=${PORT}
DATA_DIR=${DATA_DIR}
OPS_LICENSE_FILE=${LICENSE_FILE}
OPS_ALLOW_SAME_ORIGIN=1
OPS_DATA_BACKEND=sqlite
OPS_BACKUP_SCHEDULE=1
OPS_AUDIT_RETENTION=1
OPS_TOTP_KEY=${TOTP_KEY}
OPS_KIOSK_KEY=${KIOSK_KEY}
OPS_EXPORT_HMAC_KEY=${HMAC_KEY}
# Bật tính năng (mặc định tắt) nếu cần:
# OPS_FEATURE_PLANNING=1
# OPS_FEATURE_KIOSK=1
# Giới hạn CORS thay cho same-origin (nếu client khác origin):
# OPS_CORS_ORIGINS=http://10.102.3.61:${PORT}
ENV
  run chmod 600 "$ENV_FILE"
  echo "  ✓ Đã ghi $ENV_FILE (khóa chỉ nằm trong file 600 này, không vào plist/log)."
fi

# ── 4. Di trú dữ liệu app embedded cũ + license ─────────────────────────────
echo ""
echo "[4/7] Di trú dữ liệu app embedded (nếu có) + license…"
USER_UDATA="/Users/$INVOKING_USER/Library/Application Support/ops-control-desktop"
OLD_DATA="$USER_UDATA/data"
if [ -f "$DATA_DIR/ops.db" ]; then
  echo "  • DATA_DIR dịch vụ đã có ops.db — BỎ QUA migrate (không ghi đè dữ liệu daemon)."
elif [ -f "$OLD_DATA/ops.db" ]; then
  echo "  Phát hiện dữ liệu app embedded tại:"
  echo "      $OLD_DATA"
  echo "  ⚠ BẮT BUỘC: app SERVER (cửa sổ) phải đã TẮT HẲN trước khi di trú (tránh hỏng DB"
  echo "     do hai tiến trình mở cùng SQLite). Hãy thoát hẳn app Ops Control rồi tiếp tục."
  read -r -p "  App đã tắt — di trú + verify ngay bây giờ? [y/N] " ans 2>/dev/null || ans=N
  if [ "${ans:-N}" = "y" ] || [ "${ans:-N}" = "Y" ]; then
    echo "    \$ ELECTRON_RUN_AS_NODE=1 \"$ELECTRON_BIN\" migrate-datadir.cjs \"$OLD_DATA\" \"$DATA_DIR\" …"
    ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" "$MIGRATE_HELPER" "$OLD_DATA" "$DATA_DIR" "$APP" || {
      echo "  ✘ Migrate/verify THẤT BẠI — KHÔNG khởi động daemon. Xem thông báo lỗi ở trên."
      pause_close; exit 1
    }
    # license nằm 1 cấp TRÊN data/, không đi theo bản copy data → copy riêng
    if [ -f "$USER_UDATA/license.json" ] && [ ! -f "$LICENSE_FILE" ]; then
      run cp "$USER_UDATA/license.json" "$LICENSE_FILE"
    fi
    # Vô hiệu hóa DATA_DIR cũ: đổi tên → app embedded KHÔNG thể chạy nhầm DB cũ
    # (guard port không chặn được vì app dùng cổng động). App mở lại sẽ tạo DB rỗng.
    TS="$(date +%Y%m%d-%H%M%S)"
    run mv "$OLD_DATA" "$OLD_DATA.migrated-backup-$TS"
    cat > "$USER_UDATA/READ-ME-SERVER-MOVED.txt" <<EOF
Ops Control SERVER da chuyen sang DICH VU NEN (LaunchDaemon) luc $TS.
- Du lieu dang dung (authoritative): $DATA_DIR
- Backup du lieu cu:                 $OLD_DATA.migrated-backup-$TS
KHONG mo app SERVER (cua so) nua — hay dung dich vu nen. Mo app se tao DB RONG moi.
EOF
    echo "  ✓ Đã di trú + đổi tên data cũ → .migrated-backup-$TS (chống app dùng nhầm DB cũ)."
  else
    echo "  • Bỏ qua migrate — dịch vụ sẽ khởi tạo DB TRỐNG mới."
  fi
else
  echo "  • Không thấy dữ liệu app cũ ($OLD_DATA) — dịch vụ khởi tạo DB mới."
fi
# License fallback (khi không migrate nhưng app có license)
if [ ! -f "$LICENSE_FILE" ] && [ -f "$USER_UDATA/license.json" ]; then
  run cp "$USER_UDATA/license.json" "$LICENSE_FILE"
fi
if [ -f "$LICENSE_FILE" ]; then
  echo "  ✓ License: $LICENSE_FILE"
else
  echo "  ⚠ Chưa có license. Đặt file license đã ký vào: $LICENSE_FILE rồi chạy start."
fi

# ── 5. Ghi wrapper run-server.sh ────────────────────────────────────────────
echo ""
echo "[5/7] Ghi wrapper khởi chạy ($RUN_SCRIPT)…"
cat > "$RUN_SCRIPT" <<WRAP
#!/bin/bash
# Auto-generated by ops-server-install-daemon.command. Nguồn env (có khóa bí
# mật) rồi exec Electron ở chế độ node thuần để chạy server headless.
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a
export ELECTRON_RUN_AS_NODE=1
cd "$APP_WORKDIR" 2>/dev/null || true
exec "$ELECTRON_BIN" "$SERVER_ENTRY"
WRAP
run chmod 755 "$RUN_SCRIPT"

# ── 6. Ghi LaunchDaemon plist ───────────────────────────────────────────────
echo ""
echo "[6/7] Ghi $PLIST (RunAtLoad + KeepAlive)…"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUN_SCRIPT}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>WorkingDirectory</key><string>${APP_WORKDIR}</string>
  <key>StandardOutPath</key><string>${OUT_LOG}</string>
  <key>StandardErrorPath</key><string>${ERR_LOG}</string>
</dict>
</plist>
PLISTEOF
run chown root:wheel "$PLIST"
run chmod 644 "$PLIST"
plutil -lint "$PLIST" >/dev/null && echo "  ✓ plist hợp lệ"

# ── 7. Nạp + khởi động ──────────────────────────────────────────────────────
echo ""
echo "[7/7] Nạp dịch vụ vào launchd + khởi động…"
launchctl bootout "system/${LABEL}" 2>/dev/null || true
run launchctl bootstrap system "$PLIST"
run launchctl enable "system/${LABEL}"
run launchctl kickstart -k "system/${LABEL}"

echo ""
echo "  Đợi server lên…"
for i in $(seq 1 15); do
  if health >/dev/null 2>&1; then break; fi
  sleep 1
done
if health >/dev/null 2>&1; then
  echo "  ✅ Server ĐANG CHẠY — http://127.0.0.1:${PORT}/health OK"
  echo "     Client trong LAN nối tới: http://<IP-máy-này>:${PORT}"
else
  echo "  ⚠ Chưa thấy /health. Xem log: tail -n 50 $ERR_LOG"
fi
echo ""
echo "Quản lý: ops-server-status / start / stop / uninstall (.command)."
pause_close
