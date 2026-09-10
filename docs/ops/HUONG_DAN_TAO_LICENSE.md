# Hướng dẫn TẠO LICENSE — Ops Control

> Dành cho người giữ private key (CCL HQ / Henry). Mọi thông tin đã kiểm chứng từ
> `scripts/license/generate-license.mjs` + `desktop/license.js` + license thật đã cấp.

## 0. Cơ chế (đọc 1 lần cho hiểu)

- License ký bằng **Ed25519** (bất đối xứng). **Private key** ký license, **public key**
  được nhúng sẵn trong app để xác minh → ai có app cũng **không** giả được license.
- License **gắn cứng vào 1 máy** qua `installation_id` = SHA-256 vân tay phần cứng máy đó.
  Cấp cho máy A thì **không** chạy được trên máy B.
- File khoá của bạn:
  - Private (BÍ MẬT, chỉ máy này): `~/OpsControl-license-keys/prod-private.pem`
  - Public (nhúng trong app): `~/OpsControl-license-keys/prod-public.pem`
  - Lưu trữ license đã cấp: `~/OpsControl-license-keys/issued/`
- ⚠️ **Private key bị lộ = ai cũng cấp được license giả.** Giữ offline, có bản sao an toàn.
  (Key hiện tại đã xoay 2026-06-04 sau khi key dev cũ lộ qua repo.)

## 1. Tier (hạng) và số user tối đa

| Tier | Max users | Dùng cho                                |
| ---- | --------- | --------------------------------------- |
| `S`  | 15        | Nhà máy nhỏ / pilot                     |
| `M`  | 20        | Nhà máy vừa (CCL Yen Phong hiện dùng M) |
| `L`  | 50        | Cơ sở lớn                               |

`max_users` được suy ra tự động từ tier — không nhập tay.

Features mặc định (nếu không truyền `--features`): `costing,library,sales,planning,quality,mes`.

## 2. Quy trình cấp license (4 bước)

### Bước 1 — Lấy Installation ID từ máy khách

Trên máy cần cấp license, mở app → **Settings → About / Diagnostics** → mục **License status**
→ copy **Installation ID** (chuỗi 64 ký tự hex).

> Cách khác (trên chính máy đó): đọc file cache
> `~/Library/Application Support/ops-control-desktop/installation-id`.

⚠️ Khi copy/dán Installation ID: **chỉ chứa số 0-9 và a-f**. Nếu email tự chèn dấu gạch nối khi
xuống dòng → ký sai. App hiển thị ID dạng 4 cụm cách nhau bằng **dấu cách** (khi dán lại sẽ tự bỏ
dấu cách). Tuyệt đối không để lẫn ký tự khác.

### Bước 2 — Chạy lệnh ký (trên máy giữ private key)

```bash
cd "/Users/henrydang/Downloads/Claude-Cowork/3. PROJECT/Ops-Control"
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # node keg-only trên máy này

node scripts/license/generate-license.mjs \
  --installation-id <DÁN_64_HEX_TỪ_KHÁCH> \
  --customer "CCL Design Vietnam — Yen Phong" \
  --tier M \
  --expires 2029-06-09 \
  --key ~/OpsControl-license-keys/prod-private.pem \
  --out ~/OpsControl-license-keys/issued/2027-01-15-mac-<tên-máy>.json
```

Tham số:

| Cờ                  | Bắt buộc | Ý nghĩa                                             |
| ------------------- | -------- | --------------------------------------------------- |
| `--installation-id` | ✅       | 64 hex lấy ở Bước 1                                 |
| `--customer`        | ✅       | Tên khách (đặt nhất quán với các license cũ)        |
| `--tier`            | ✅       | `S` / `M` / `L`                                     |
| `--expires`         | ✅       | Ngày hết hạn `YYYY-MM-DD` (ví dụ `2029-06-09`)      |
| `--key`             | ✅       | Đường dẫn private key (ngoài repo)                  |
| `--features`        | ❌       | Mặc định đủ 6 feature; chỉ truyền nếu muốn giới hạn |
| `--out`             | ❌       | Đường dẫn file ra; bỏ thì in ra màn hình            |

> **Quy ước đặt tên file** trong `issued/`: `YYYY-MM-DD-<platform>-<tên>.json`
> (ví dụ đã có: `2026-06-22-mac-server.json`, `2026-06-22-win-Mark.json`). Giúp tra cứu sau này.

### Bước 3 — Gửi file license cho khách

Gửi file `.json` vừa tạo (qua Zalo/Teams/email). File này **không bí mật** (không chứa private key),
nhưng chỉ chạy đúng trên máy có `installation_id` khớp.

### Bước 4 — Khách áp license vào app

Trên máy khách: app sẽ hiện hộp thoại License (hoặc **Settings → License → Apply**) → dán nội dung
JSON → app xác minh chữ ký + installation_id + hạn → nếu hợp lệ, lưu vào
`~/Library/Application Support/ops-control-desktop/license.json` và mở khoá.

## 3. Định dạng license (tham khảo — KHÔNG sửa tay)

File output sẽ có dạng đúng như license thật đang chạy:

```json
{
  "version": 2,
  "installation_id": "323778c829bba9800dbbd70c7346c546ac141f5bc68a28e36d2ef7c2d84a73c8",
  "customer": "CCL Design Vietnam — Yen Phong",
  "tier": "M",
  "max_users": 20,
  "issued_at": "2026-06-22T04:49:55.554Z",
  "expires_at": "2029-06-09T00:00:00.000Z",
  "features": ["costing", "library", "sales", "planning", "quality", "mes"],
  "signature": "yBAUS/b10ySrrMh6Kup4YV9N…(Ed25519, base64)"
}
```

⚠️ **Sửa bất kỳ field nào** (kể cả 1 ký tự `customer`) → chữ ký sai → app từ chối. Muốn đổi → cấp lại.

## 4. Cấp lại license khi ĐỔI/HỎNG máy (quan trọng cho chuyển server)

Khi chuyển sang máy mới, `installation_id` **sẽ khác** → license cũ báo `installation-mismatch`.
Cách xử lý:

1. Cài app trên máy mới → lấy **Installation ID mới** (Bước 1).
2. Chạy lại lệnh ký với `--installation-id <ID mới>` (Bước 2), giữ nguyên customer/tier/expires.
3. Lưu vào `issued/` với tên máy mới + gửi cho máy mới áp dụng.
   > Vì bạn giữ private key nên **tự cấp lại được, không cần ai khác**. Hãy backup private key ra nơi
   > an toàn (offline) — mất nó là mất khả năng cấp license.

## 5. Các lỗi license thường gặp (từ `desktop/license.js`)

| reason                       | Nghĩa                              | Xử lý                                    |
| ---------------------------- | ---------------------------------- | ---------------------------------------- |
| `installation-mismatch`      | License của máy khác               | Cấp lại cho installation_id máy này (§4) |
| `expired`                    | Quá hạn `expires_at`               | Cấp license mới với hạn xa hơn           |
| `bad-signature`              | File bị sửa / sai key              | Cấp lại; kiểm tra ID không lẫn ký tự lạ  |
| `unsupported-version`        | License v1 (HMAC cũ)               | Cấp lại bản v2                           |
| `bad-tier` / `tier-mismatch` | Tier sai hoặc max_users không khớp | Cấp lại đúng tier (đừng sửa tay)         |

## 6. Checklist an toàn private key

- [ ] `prod-private.pem` quyền `600`, chỉ trên máy HQ.
- [ ] Có **1 bản sao offline** (USB mã hoá / két) — phòng khi máy hỏng.
- [ ] **Không bao giờ** commit private key vào git.
- [ ] Mỗi license cấp ra lưu lại trong `issued/` (để tra cứu + cấp lại nhanh).
