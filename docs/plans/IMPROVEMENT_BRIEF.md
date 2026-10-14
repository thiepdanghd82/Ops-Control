# PROMPT: Audit & Cải tiến dự án "Ops Control v1.2"

> File này được dùng làm brief chuẩn cho Claude Code thực thi việc audit và cải tiến dự án.
> Cách dùng: mở Claude Code tại thư mục gốc của dự án, gõ:
> `Hãy đọc IMPROVEMENT_BRIEF.md và thực hiện theo từng giai đoạn.`

---

## 1. VAI TRÒ (Role)

Bạn đóng vai **Senior Software Architect** với hơn 20 năm kinh nghiệm tại IBM, chuyên gia phát triển các hệ thống ERP cấp doanh nghiệp như **SAP ERP, IFS Applications, và MES (Manufacturing Execution System)**. Bạn có chuyên môn sâu về:

- Kiến trúc Client-Server cho ứng dụng desktop
- Bảo mật ứng dụng doanh nghiệp (authentication, authorization, encryption)
- UI/UX cho phần mềm công nghiệp (in ấn, sản xuất, quản lý kho)
- Đóng gói và triển khai cross-platform (macOS + Windows)

---

## 2. NGỮ CẢNH (Context)

Dự án **"Ops Control v1.2"** là phần mềm quản lý vận hành cho ngành in ấn công nghiệp, bao gồm các module:

- Costing (tính giá thành)
- Design (thiết kế)
- Process Development (phát triển quy trình)
- Product Control (kiểm soát sản phẩm)
- Warehouse Management (quản lý kho)

---

## 3. NHIỆM VỤ GIAI ĐOẠN 1 — DISCOVERY (Đọc & Phân tích)

**Bước 1:** Đọc kỹ **toàn bộ** các file trong folder `README FIRST` của project. Liệt kê từng file đã đọc kèm tóm tắt 2–3 dòng.

**Bước 2:** Quét toàn bộ cấu trúc thư mục dự án (`tree -L 3` hoặc tương đương) và xác định:

- Tech stack hiện tại (framework, ngôn ngữ, build tool)
- Kiến trúc hiện tại (monolithic / modular / client-server)
- Các điểm yếu về architecture, security, UX

**KHÔNG viết code ở giai đoạn này.** Trình bày kết quả dưới dạng báo cáo discovery.

---

## 4. NHIỆM VỤ GIAI ĐOẠN 2 — PROPOSAL (Đề xuất giải pháp)

Đưa ra **bản đề xuất cải tiến** (improvement plan) đáp ứng đủ 5 mục tiêu:

### 4.1. UI/UX Chuyên nghiệp

- Thiết kế lại giao diện theo design system thống nhất (đề xuất: Fluent UI / Material 3 / shadcn-style)
- Tối ưu cho người dùng nhà máy in (font lớn, contrast cao, ít click, hỗ trợ tiếng Việt)
- Cung cấp wireframe / mockup mô tả các màn hình chính

### 4.2. Clean Code & Bảo mật tuyệt đối

- Áp dụng SOLID, layered architecture (Presentation / Business / Data Access)
- Bảo mật:
  - Hash password (bcrypt / argon2)
  - JWT cho session
  - TLS cho giao tiếp Client–Server
  - Mã hóa file cấu hình nhạy cảm
  - Chống SQL injection
  - Audit log cho mọi hành động quan trọng
- Có linter, formatter, pre-commit hooks, unit test coverage ≥ 70%

### 4.3. Build 2 phiên bản × 2 hệ điều hành (4 installer)

| Edition            | macOS           | Windows         |
| ------------------ | --------------- | --------------- |
| **Server Edition** | `.dmg` / `.pkg` | `.msi` / `.exe` |
| **Client Edition** | `.dmg` / `.pkg` | `.msi` / `.exe` |

- **Server Edition:**
  - Chạy lên có wizard setup (database, port, license key, tạo admin)
  - Giao diện quản trị tạo / sửa / xóa user cho Client
- **Client Edition:**
  - Lần đầu khởi động yêu cầu nhập **địa chỉ server** + test connection
  - Sau đó hiển thị màn login dùng tài khoản do Server cấp
- Đề xuất công cụ build: `electron-builder` / `Tauri` / `Avalonia` (chọn 1 và giải thích lý do)

### 4.4. Audit Package & Dependencies

- Liệt kê tất cả package hiện có trong `package.json` / `requirements.txt` / `*.csproj` ...
- Phân loại:
  - ❌ Outdated
  - ⚠️ Vulnerable (check CVE)
  - ✅ OK
  - 🔄 Đề xuất thay thế
- Đề xuất package thay thế kèm lý do (performance, license, maintenance)

### 4.5. License Tier theo số lượng user

Thiết kế cơ chế license / feature flag giới hạn:

- **Tier S:** tối đa **15** user
- **Tier M:** tối đa **20** user
- **Tier L:** tối đa **50** user

Cơ chế kiểm tra ở Server, lưu license dạng signed token (RSA), không cho bypass ở Client.

---

## 5. NHIỆM VỤ GIAI ĐOẠN 3 — IMPLEMENTATION ROADMAP

Sau khi tôi **review và duyệt** bản đề xuất ở mục 4, hãy chia công việc thành các **phase nhỏ** (mỗi phase ≤ 1 tuần), mỗi phase có:

- Mục tiêu cụ thể
- Danh sách file sẽ tạo / sửa
- Acceptance criteria
- Cách test

---

## 6. RÀNG BUỘC (Constraints)

- Giữ tương thích ngược với dữ liệu của v1.2 hiện tại (cần migration script nếu đổi schema)
- Không tự ý thay đổi business logic mà chưa hỏi
- Mọi thay đổi lớn phải confirm trước khi code
- Trả lời bằng **tiếng Việt**
- Nếu thiếu thông tin → **đặt câu hỏi**, không tự suy đoán

---

## 7. OUTPUT MONG ĐỢI Ở LƯỢT TRẢ LỜI ĐẦU TIÊN

1. Xác nhận đã đọc folder `README FIRST` (liệt kê file)
2. Báo cáo Discovery (mục 3)
3. Bản Proposal tổng quan (mục 4) — dạng markdown có heading rõ ràng
4. Danh sách câu hỏi cần tôi làm rõ trước khi sang giai đoạn Implementation

---

## 8. GHI CHÚ KHI DÙNG VỚI CLAUDE CODE

- Mở Claude Code ngay tại thư mục gốc của dự án: `cd Ops-Control-v1.2 && claude`
- Sau giai đoạn Discovery, yêu cầu Claude Code dùng **Plan Mode** (`Shift + Tab` hai lần) trước khi cho phép sửa code thật
- Có thể yêu cầu Claude Code tạo file `PROPOSAL.md` để lưu lại bản đề xuất, tiện cho việc review nhiều lần
- Khi sang giai đoạn Implementation, dùng từng phase một, không gộp nhiều phase trong một prompt
