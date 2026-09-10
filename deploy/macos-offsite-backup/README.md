# Off-site backup (macOS) — Ops Control

Đóng lỗ hổng audit **H-1**: hiện mọi backup nằm cùng ổ đĩa với dữ liệu sống. Bộ này
sao chép (mirror) toàn bộ dữ liệu Ops Control ra **ổ ngoài** mỗi 4 giờ.

## File

- `offsite-backup.sh` — script rsync (mirror userData → ổ ngoài, bỏ qua cache).
- `vn.ccldesign.opsbackup.offsite.plist` — LaunchAgent (chạy lúc load + mỗi 4 giờ).
- `install.sh` / `uninstall.sh` — cài / gỡ.

## Cài đặt

1. Cắm 1 ổ SSD/USB ngoài, đặt tên volume là **`OPSBACKUP`**
   (hoặc sửa `DEST_VOLUME` trong `offsite-backup.sh` cho khớp tên ổ của bạn).
2. Chạy:
   ```bash
   bash "deploy/macos-offsite-backup/install.sh"
   ```
3. Xong. Agent chạy mỗi 4 giờ; **tự bỏ qua** khi chưa cắm ổ (ghi log, không báo lỗi).

## Kiểm tra

```bash
tail -f ~/Library/Logs/ops-offsite-backup.log      # xem nhật ký
ls -la /Volumes/OPSBACKUP/ops-control-mirror/       # nội dung mirror
cat /Volumes/OPSBACKUP/ops-control-mirror/LAST_MIRROR_OK.txt   # lần mirror gần nhất
```

## Nội dung mirror

Toàn bộ `~/Library/Application Support/ops-control-desktop/` (gồm `data/ops.db`,
`Library/`, `Backup/`, `.env`, `ops-control-config.json`, `license.json`) — **một bản
sao đầy đủ để phục hồi**, không chỉ thư mục Backup. ⚠️ Vì có chứa `.env` (khoá bí mật),
hãy giữ ổ ngoài ở nơi an toàn.

## Gỡ

```bash
bash "deploy/macos-offsite-backup/uninstall.sh"
```

## Lưu ý hoàn thiện 3-2-1

Đây là bản sao **thứ 2** (ổ ngoài). Để đủ quy tắc 3-2-1, thêm 1 đích **ngoài toà nhà**
(NAS phòng IT hoặc cloud có mã hoá) — có thể thêm 1 `rsync`/upload đích thứ 2 vào cuối
`offsite-backup.sh`.
