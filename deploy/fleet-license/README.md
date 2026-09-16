# OpsControl — kiểm tra license máy (gửi operator qua Zalo)

Mục đích: biết máy đang chạy license **thật** hay **TRIAL** (trial sẽ KHÓA app khi hết hạn).

## Lời nhắn mẫu gửi operator qua Zalo

**Mac (6 máy operator + máy Lead):**

> Gửi file `check-license.command`. Tải về → **double-click**. Nếu macOS chặn:
> chuột phải → **Open** → **Open**. Cửa sổ hiện 1 dòng — chụp màn hình gửi lại em.

**Windows (máy mpham):**

> Gửi file `check-license.bat`. Tải về → **double-click**. Nếu SmartScreen chặn:
> **More info** → **Run anyway**. Cửa sổ hiện 1 dòng — chụp màn hình gửi lại em.

## Dòng kết quả đọc thế nào

```
<hostname> | <TYPE> | tier <S/M/L> | <expires_at> | <days-left>d
```

- `TYPE = REAL` → license thật, chỉ cần để ý `days-left`.
- `TYPE = TRIAL` → ⚠️ **trial 14 ngày**, hết hạn là app **KHÓA hẳn** (quit, không mở được). Cần cấp license thật trước khi `days-left` về 0.
- `TYPE = UNLICENSED` → ⚠️ chạy chế độ không license (chỉ dành cho dev) — không được dùng prod.
- `NO-LICENSE-FILE` → app chưa chạy lần nào trên máy đó.

## Ghi chú kỹ thuật (cho Lead)

- Script đọc **trực tiếp file license** chứ không gọi `/api/license/status` —
  endpoint đó cần đăng nhập admin, không tiện cho script chạy 1-click.
  - macOS: `~/Library/Application Support/ops-control-desktop/license.json`
  - Windows: `%APPDATA%\ops-control-desktop\license.json`
- Mọi máy desktop (kể cả CLIENT thin-mode) đều có file này: app khi khởi động
  (bản đóng gói) luôn chạy `checkOnBoot` → nếu chưa có license sẽ tự cấp 1 trial
  14 ngày. ⇒ **mỗi máy cần 1 license thật riêng** (HW-bound), không phải chỉ SERVER.
  </content>
