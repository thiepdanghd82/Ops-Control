# Checklist kiểm tra tay trước khi đưa Ops-Control vào sử dụng

Đánh dấu `[x]` khi đã kiểm tra. Mục có **(chặn)** phải đạt mới được release.
Kết quả tự động: xem `audit/reports/<mới nhất>/SUMMARY.md`.

## A. Dữ liệu (rủi ro lớn nhất với app quản lý sản xuất)

- [ ] **(chặn)** Backup tự động chạy (`npm run backup:run`) và file backup mở được.
- [ ] **(chặn)** Đã thử KHÔI PHỤC từ backup lên máy sạch, dữ liệu costing/BOM/quotation khớp.
- [ ] Backup lưu ở nơi khác ổ cài app (NAS/OneDrive), giữ ít nhất 7 bản.
- [ ] Import Excel (raw materials, finished goods, BOM) với file sai định dạng → app báo lỗi, không ghi đè dữ liệu cũ.
- [ ] Số liệu costing (VA%, Contribution%) tính lại khớp với file Excel chuẩn của phòng (chọn 3 quote mẫu).
- [ ] Log audit (`scripts/verify-audit-chain.mjs`) còn nguyên vẹn sau khi sửa/xoá bản ghi.

## B. Đăng nhập & phân quyền

- [ ] **(chặn)** Tài khoản mặc định/first-run đã đổi mật khẩu; `users.json` không nằm trong git.
- [ ] **(chặn)** User thường không mở được trang admin bằng cách gõ URL trực tiếp (thử `/admin`, `/api/users`).
- [ ] 2FA/TOTP reset chỉ admin làm được; test `reset-totp` không lộ secret ra log.
- [ ] Đăng nhập sai 5 lần → khoá/tạm khoá.
- [ ] Session hết hạn khi đóng app hoặc sau thời gian đặt trước.

## C. Electron desktop

- [ ] **(chặn)** Cửa sổ chính: `contextIsolation: true`, `nodeIntegration: false` (đã đúng trong main.js).
- [ ] Cửa sổ Setup Wizard và First-Run đang dùng `nodeIntegration: true` — chỉ chấp nhận nếu HTML nạp là file cục bộ cố định, không bao giờ nạp URL/HTML từ server. Tốt hơn: chuyển sang preload + contextBridge.
- [ ] `preload.js` chỉ expose các hàm cần thiết, không expose `ipcRenderer` nguyên bản hay `require`.
- [ ] Mỗi `ipcMain.handle` kiểm tra kiểu dữ liệu và đường dẫn (không cho `..`).
- [ ] Auto-update: URL HTTPS, có kiểm chữ ký; thử cập nhật từ bản cũ → mới thành công.
- [ ] Installer Windows (NSIS) có code-sign hoặc đã ghi hướng dẫn SmartScreen cho IT.

## D. Server (Express + SQLite)

- [ ] CORS chỉ cho origin của app (localhost cổng cố định / app scheme), không `*` khi chạy production.
- [ ] Server chỉ lắng nghe `127.0.0.1` khi chạy kèm desktop; nếu mở cho LAN thì có login và HTTPS/reverse proxy.
- [ ] Upload (multer) giới hạn dung lượng và loại file; file lưu ngoài thư mục web.
- [ ] Không có secret trong log (`console.log` mật khẩu, token, TOTP secret).
- [ ] `.env` production khác `.env.example`, có SESSION/JWT secret ngẫu nhiên ≥ 32 ký tự.

## E. Vận hành

- [ ] **(chặn)** Có hướng dẫn cài đặt và khôi phục cho IT (1 trang).
- [ ] Có kế hoạch rollback: giữ installer bản trước + backup DB trước khi nâng cấp.
- [ ] Thử trên 1 máy người dùng thật (không phải máy dev) trong ≥ 3 ngày trước khi phát rộng.
- [ ] `npm test` và `npm run precheck` xanh trên bản build release.

---

Người kiểm tra: **\_\_** Ngày: **\_\_** Phiên bản: **\_\_** Kết luận: ĐẠT / CHƯA ĐẠT
