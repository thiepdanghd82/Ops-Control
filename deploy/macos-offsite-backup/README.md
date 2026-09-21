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

## Tạm giữ agent (không gỡ hẳn)

`uninstall.sh` **xoá** plist. Khi chỉ muốn ngừng chạy tự động mà vẫn giữ cấu hình,
đổi tên plist kèm ngày:

```bash
launchctl bootout gui/$(id -u)/vn.ccldesign.opsbackup.offsite 2>/dev/null
mv ~/Library/LaunchAgents/vn.ccldesign.opsbackup.offsite.plist{,.disabled-$(date +%Y%m%d)}
```

`install.sh` **nhận ra dấu này**: nó vẫn cập nhật script và làm mới plist đang giữ,
nhưng không `launchctl load`, và in ra lý do. Bật lại thì xoá hậu tố `.disabled-*`
bằng tay rồi chạy `install.sh`; cần ép trong một lần thì
`OPS_FORCE_ENABLE_AGENT=1 bash install.sh`.

**Trạng thái hiện tại trên máy SERVER: agent đang bị giữ từ 2026-09-17.** Nó chưa một
lần nào chạy thành công khi không có người khởi động — job của `launchd` không đọc được
SMB share do Finder mount, còn `mount_smbfs` của chính nó bị từ chối vì Finder đang giữ
đúng share đó. Mọi lần chạy theo lịch vì thế rơi vào nhánh `error` (không phải `skip`),
làm thẻ **Settings → Backup** đỏ mỗi 4 tiếng trong khi các lần chạy tay vẫn ghi `ok` —
một chỉ báo sức khoẻ lúc xanh lúc đỏ thì tệ hơn là sai đều, vì không ai biết tin cái nào.
Nguyên nhân gốc vẫn **chưa tìm ra** (CLAUDE.md, Bài học 44). Chạy tay khi cần:

```bash
bash ~/Library/Application\ Support/ops-offsite-backup/offsite-backup.sh
```

## Lưu ý hoàn thiện 3-2-1

Đây là bản sao **thứ 2** (ổ ngoài). Để đủ quy tắc 3-2-1, thêm 1 đích **ngoài toà nhà**
(NAS phòng IT hoặc cloud có mã hoá) — có thể thêm 1 `rsync`/upload đích thứ 2 vào cuối
`offsite-backup.sh`.
