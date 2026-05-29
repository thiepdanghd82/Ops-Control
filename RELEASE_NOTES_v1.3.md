# Ops Control v1.3 — Bản tin phát hành

**Ngày phát hành:** 29/04/2026
**Đối tượng:** Operator + IT admin tại CCL Vietnam.
**Tải xuống:** xem `dist/` (4 file DMG cho macOS) + `dist/checksums.txt`.

---

## ✨ Có gì mới?

### Bảo mật được nâng cấp toàn diện

- 🔐 **Mật khẩu giờ dùng argon2id** — kiểu hash hiện đại nhất 2026, mạnh hơn bcrypt 4× chống tấn công GPU/ASIC. Bạn không cần làm gì — login lần đầu sẽ tự động đổi cách lưu.
- 🔐 **License giờ ký bằng Ed25519** — mã ký bất đối xứng (CCL HQ giữ private key, app chỉ embed public key). Một install bị crack KHÔNG còn dùng để giả license máy khác được nữa.
- 🔐 **Tất cả CVE high đã vá** — Electron, electron-builder, postcss bump lên bản mới nhất. `npm audit` giờ sạch high+ trên cả 3 package.
- 🔐 **Content Security Policy** — chặn XSS qua artwork upload + chặn navigation lạ.

### Setup Wizard cho lần đầu cài

- **Server Edition** — 4 bước trong khoảng 5 phút: License → Data path → Network → Tạo admin.
- **Client Edition** — 2 bước: nhập địa chỉ server + test connection.
- Toàn bộ giao diện tiếng Việt, font lớn, dễ đọc cho phân xưởng.

### License theo Tier (S / M / L)

| Tier  | Max users | Use case              |
| ----- | --------- | --------------------- |
| **S** | 15        | Plant nhỏ, 1 ca       |
| **M** | 20        | Plant trung, 2 ca     |
| **L** | 50        | Plant lớn, multi-site |

Server tự động chặn tạo user mới khi vượt giới hạn → liên hệ CCL HQ để upgrade tier.

### Audit log có tab riêng

Trước đây nằm rải rác trong console log; giờ có tab **Audit log** trong sidebar (chỉ sys mới thấy). Filter theo event/user/date range, hiển thị 200 row gần nhất.

### CI/CD pipeline

- GitHub Actions chạy 5 jobs (audit / lint / test-server / test-client / build) trên mỗi push.
- Vuln scan gate: PR có high vuln sẽ bị block.
- Coverage gate 70% lines (Jest threshold).

---

## 🆙 Cách upgrade

Đọc `MIGRATION_GUIDE.md` cho hướng dẫn chi tiết. Tóm tắt:

1. **Backup** — file `backup/v1.2_pre_upgrade_<ts>.tar.gz` đã tạo tự động khi build v1.3 pass.
2. **Email Installation ID** + tier mong muốn cho CCL HQ ops.
3. **Cài DMG mới** (drag-replace vào `/Applications`).
4. **Setup Wizard** chạy tự động lần đầu mở.
5. **License JSON v2** từ CCL HQ → dán vào wizard.
6. Operator login bình thường — mật khẩu cũ vẫn hoạt động + được tự động nâng cấp argon2id.

**Thời gian downtime:** ~10 phút mỗi máy.
**Rollback:** có thể rollback trong 24 h đầu (xem MIGRATION_GUIDE §8).

---

## ⚠️ Những điều cần biết

### Phải làm

- ✅ Email Installation ID cho CCL HQ TRƯỚC KHI cài v1.3 (license v1 cũ KHÔNG còn được chấp nhận).
- ✅ Backup `~/Library/Application Support/Ops Control/` ra ổ cứng ngoài.

### Không làm

- ❌ Đừng chạy v1.2 và v1.3 song song trên cùng một máy server (port conflict).
- ❌ Đừng share `license.json` giữa các máy — license bound theo Installation ID.
- ❌ Đừng dùng license trial 14 ngày trong production — hết hạn là server tự động về tier-S fallback và chặn tạo user mới.

### Đã defer sang v1.3.1

- Bộ cài Windows `.exe` (chưa build — Mac host hiện không có Wine).
- TLS / mTLS giữa Client ↔ Server (vẫn HTTP).
- Refactor đầy đủ `costApi.js` 2891 LOC (mới chỉ extract audit router làm POC).

---

## 📞 Liên hệ

| Vấn đề          | Kênh                                                 |
| --------------- | ---------------------------------------------------- |
| License         | Email thiepdt@outlook.com (kèm Installation ID)      |
| Bug / crash     | GitHub Issues + screenshot + log từ Settings → About |
| Hỗ trợ kỹ thuật | thiepdt@outlook.com                                  |

---

**Cảm ơn các bạn đã kiên nhẫn trong giai đoạn upgrade. Mọi feedback đều được ghi nhận để cải tiến v1.3.1.**
