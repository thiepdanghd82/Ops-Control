# Ops-Control – Bộ audit trước khi đưa vào sử dụng

Thư mục này chứa bộ công cụ kiểm tra bảo mật/rủi ro cho Ops-Control
(Express server + React client + Electron desktop + SQLite).
Chạy trước mỗi lần phát hành (release) hoặc trước khi cài lên máy người dùng.

## Chạy nhanh

macOS / Linux:
./audit/run-audit.sh

Windows (PowerShell):
.\audit\run-audit.ps1

Kết quả nằm trong `audit/reports/<ngày-giờ>/` kèm file `SUMMARY.md`.

## Các lớp kiểm tra

| #   | Lớp                | Công cụ                                                                                | Bắt gì                                                             |
| --- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Thư viện phụ thuộc | `npm audit` (root + client + desktop)                                                  | CVE trong package đang dùng                                        |
| 2   | Secrets lỡ commit  | Semgrep `p/secrets` + grep lịch sử git                                                 | API key, mật khẩu, token                                           |
| 3   | Lỗi code (SAST)    | Semgrep `p/nodejs p/javascript p/electron p/owasp-top-ten` + rule riêng `audit/rules/` | injection, path traversal, cấu hình Electron sai, CORS mở, JWT yếu |
| 4   | Cấu hình Electron  | Electronegativity                                                                      | nodeIntegration, contextIsolation, CSP, openExternal               |
| 5   | Kiểm tra tay       | `audit/CHECKLIST.md`                                                                   | phân quyền, backup/restore, dữ liệu costing/BOM                    |

## Cài đặt công cụ (một lần)

    pip3 install semgrep            # hoặc: brew install semgrep
    brew install gitleaks trivy     # tuỳ chọn, script tự bỏ qua nếu thiếu
    # Electronegativity chạy qua npx, không cần cài

## Đọc kết quả

- `SUMMARY.md` – tổng hợp số finding theo mức độ, đọc cái này trước.
- `semgrep.txt` / `semgrep.sarif` – chi tiết từng dòng code (SARIF mở được trong VS Code với extension "SARIF Viewer").
- `npm-audit-*.txt` – CVE theo từng package. CVE đã chấp nhận rủi ro phải có trong `security-allowlist.json` (có ngày hết hạn).
- `electronegativity.csv` – cấu hình Electron.

Nguyên tắc: **0 finding mức ERROR/CRITICAL/HIGH** trước khi release. Finding mức WARNING/MODERATE
phải có lý do ghi trong `security-allowlist.json` hoặc ticket sửa.
