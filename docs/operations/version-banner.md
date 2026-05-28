# Client version banner — operations guide (P0)

Visibility-only nudge added in v1.5.11. Operators on outdated client builds see a red banner
linking them back to you (Lead). No auto-download in P0 — you keep 100% control of rollout
pace.

## Quy trình khi deploy server mới

1. **Deploy server** (Mac DMG hoặc Windows EXE SERVER) như thường lệ. Server boot lên với
   `version` mới (đọc từ `package.json`).
2. **Trong vòng ~5 phút** (chu kỳ poll mặc định), mọi client đang chạy sẽ nhận biết server đã
   lên version mới và hiển thị banner đỏ ở đầu màn hình:
   > **Phiên bản client đã cũ.** Server đã lên vX, bạn đang dùng vY. Vui lòng **liên hệ
   > Lead** để nhận file cài đặt mới trước khi tiếp tục thao tác quan trọng.
3. Operator có 2 lựa chọn:
   - **Liên hệ Lead** (Zalo / điện thoại) để nhận file installer mới — đây là kênh chính
     thức ở P0.
   - **Thu gọn**: ẩn banner xuống thành chip nhỏ ở góc trên-phải. Chip vẫn hiện cho đến khi
     server lên version mới hơn (tự re-expand thành banner mới).
4. **Anh gửi installer** qua Zalo (DMG cho Mac, EXE cho Win). Operator cài đè bản cũ. Lần
   mở app kế tiếp, banner/chip biến mất tự động.

## Theo dõi trạng thái upgrade

`Settings → Account Control → Users tab → cột "CLIENT VER"`.

Mỗi operator có 1 badge:

| Badge                             | Nghĩa                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `✓ 1.5.11` (xanh)                 | Operator's client version khớp với server hiện tại. Họ đã upgrade.                                                         |
| `⚠ 1.5.10 (server: 1.5.11)` (cam) | Operator đã thấy banner nhưng chưa upgrade. Hoặc đã upgrade nhưng server đã lên thêm 1 version nữa sau đó.                 |
| `? offline` (xám)                 | Không có audit event nào trong 7 ngày qua. Có thể operator chưa mở app, hoặc client cũ quá (pre-v1.5.11) không emit audit. |

Hover badge để xem chi tiết: client version, server version, timestamp event gần nhất.

## Khi nào không xuất hiện banner

- Client `version` === server `version` → banner ẩn hoàn toàn.
- `GET /api/version` không reachable (mạng down, server stop) → poll fail silent, không hiện
  error UI. State cuối được giữ nguyên (nếu trước đó banner đang hiển thị thì vẫn hiển thị
  với thông tin cuối).
- Client build cũ hơn v1.5.11 (chưa có component này) → operator sẽ không thấy gì cả. Đây là
  case dùng `? offline` badge để Lead nhận biết.

## Audit log

Lead có thể tra event trong Sys → Audit Log:

- `CLIENT_UPGRADE_NUDGE_SHOWN` — mỗi lần operator mở app trong khi version mismatch sẽ ghi
  1 record (không phải mỗi 5 phút poll). Đếm record này để biết operator đã mở app bao nhiêu
  lần mà chưa upgrade.
- `CLIENT_VERSION_MATCH_AFTER_UPGRADE` — operator đã cài bản mới + mở app, version khớp lại.
  Có chính xác 1 record per upgrade transition.

Cả 2 event đều có `detail` JSON: `{ client_version, server_version, platform }`. Platform là
`'mac'`, `'win'`, `'linux'`, hoặc `'unknown'`.

## P0.1 follow-up (sẽ ship sau khi review path-traversal cho `/downloads/`)

- Button "Tải bản mới" trong banner → tải installer trực tiếp từ server (qua LAN, ~30s).
- Audit event mới `CLIENT_UPGRADE_NUDGE_DOWNLOAD_CLICKED` để Lead theo dõi operator nào đã
  bấm tải.
- Không cần can thiệp manual qua Zalo nữa — operator self-serve.

P0.1 không yêu cầu reinstall toàn bộ client; chỉ thêm button + bridge IPC + endpoint static.
