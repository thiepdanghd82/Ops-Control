# CI Triage — Phase 0.1 Snapshot

**Date:** 2026-06-20 • **Run on:** main @ `fc80b7d` (post 4-PR cascade) • **Owner:** Henry • **Phase:** 0.1 of Debug Playbook

> Mục đích: bảng phân loại đỏ CI hiện tại thành 3 nhóm để Phase 0.2-0.5 xử lý đúng nhóm — KHÔNG sửa gì cho tới khi triage xong.

## Định nghĩa nhóm

- **(A) Đỏ thật** — regression/lỗi logic, có thể bug ẩn → sửa ngay
- **(B) Đỏ nhiễu** — warning bị treat-as-error, format/style → chuẩn hóa rule + auto-fix
- **(C) Đỏ chấp nhận có kiểm soát** — CVE chưa có patch / scoped dev-only → allowlist có expiry

---

## 1. Lint + Format job (5 errors + 401 warnings)

### Errors (5) — phải fix để CI green

| #   | File:line                                     | Rule                       | Nhóm            | Bản chất                                                                                                                                                                                                                                          | Action                                                                                                                      |
| --- | --------------------------------------------- | -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| E1  | `desktop/preload.js:149`                      | `no-dupe-keys` `'license'` | **(A) ĐỎ THẬT** | 2 object literal `license:` (line 54 partial 2-method + line 149 complete 4-method). JS spec: later wins → license manager work hiện tại, **NHƯNG fragile** nếu ai reorder file. S-DIAG-FIX (2026-05-05) thêm khối complete mà KHÔNG xóa khối cũ. | Delete khối line 48-58 (older partial); giữ block 142-154. Lesson candidate: "ESLint bắt được latent bug, đừng vội silence" |
| E2  | `client/src/services/connectionHealth.js:47`  | `no-unused-vars` `_`       | (B) ĐỎ NHIỄU    | Variable named `_` literal bị flag (allowed pattern `/^_/u` đáng lẽ match nhưng có cảnh báo trùng kiểu `_` re-binding)                                                                                                                            | Rename `_` → `_unused` hoặc `_err`; HOẶC dùng destructure rest pattern                                                      |
| E3  | `client/src/services/connectionHealth.js:183` | `no-unused-vars` `_`       | (B) ĐỎ NHIỄU    | Same as E2                                                                                                                                                                                                                                        | Same as E2                                                                                                                  |
| E4  | `client/src/services/printAreaCore.js:1310`   | `no-empty`                 | (B) ĐỎ NHIỄU    | Empty catch block hoặc empty `if` body                                                                                                                                                                                                            | Add `/* swallow: <reason> */` comment OR remove block; verify intentional                                                   |
| E5  | `client/src/services/printAreaCore.js:1314`   | `no-empty`                 | (B) ĐỎ NHIỄU    | Same pattern as E4                                                                                                                                                                                                                                | Same as E4                                                                                                                  |

**E1 = real latent bug** — fix bằng PR riêng + add test fixture "renderer.window.ops.license.apply is a function" để pin contract.

### Warnings (401) — phân loại

| Loại                                                 | Count (xấp xỉ) | Nhóm              | Action                                                                                                                                                               |
| ---------------------------------------------------- | -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-unused-vars` server (`err`, `_`, unused imports) | ~280           | (B)               | `npm run lint -- --fix` không tự fix được; rename `err` → `_err` theo chỗ; xóa unused imports                                                                        |
| `react-hooks/exhaustive-deps` (client)               | ~50            | (B)→(A) cần audit | Mỗi case classify như MES-3-FIX-20 — phần lớn là intentional mount-only fetch (Lesson 18); ghi `// eslint-disable-next-line react-hooks/exhaustive-deps -- <reason>` |
| `react-hooks/set-state-in-effect` (client)           | ~30            | (B)→(A) cần audit | Vài case là real anti-pattern (cascading renders); vài case là correct setState onChange. Audit per call site.                                                       |
| Unused eslint-disable directives                     | ~15            | (B)               | Xóa stale directives (refactor đã làm rule tự pass)                                                                                                                  |
| Inline `style={{...}}` (top-5 offenders)             | 5              | (C)               | Đã allowlist trong `client/eslint.config.js` per Sprint 12. Keep allowlist.                                                                                          |
| Khác (`react-refresh/only-export-components`, etc.)  | ~21            | mix               | Audit batch sau khi nhóm chính cleared                                                                                                                               |

**Note:** Số warnings không gate CI hôm nay (mặc định warning ≠ error), nhưng `--max-warnings 0` đang được set thì sẽ gate. **Check `.github/workflows/ci.yml`** để xác định.

---

## 2. Vulnerability Scan job (26 CVE: 2 critical / 3 high / 20 moderate / 1 low)

### Critical (2) — xử lý ngay

| Package                                | CVE                                                                                 | Reachable from runtime?                                                 | Nhóm           | Action                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ----------------------------------------------- |
| **`shell-quote`** (via `concurrently`) | GHSA-w7jw-789q-3m8p (CVSS 8.1) — `quote()` không escape newlines trong `.op` values | **NO** — `concurrently` dev-only (`npm run dev`), không bundled vào DMG | (B) → fix easy | `npm audit fix` (fixAvailable: true, non-major) |
| **`concurrently`** (parent)            | Cascade từ shell-quote                                                              | NO — dev-only                                                           | (B)            | Same — `npm audit fix`                          |

### High (3)

| Package                                          | CVE                                                                         | Reachable?                                                                                                      | Nhóm                        | Action                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **`@playwright/test`** + transitive `playwright` | GHSA-7mvr-c777-76hp (browser download SSL bypass)                           | **NO** — Playwright chỉ chạy E2E (`apps/kiosk/tests/e2e`), không bundled prod. Browser binary đã install local. | (B)                         | `npm i -D @playwright/test@^1.61.0` (non-major)                                                                                 |
| **`multer`** (×2 advisories)                     | GHSA-72gw-mp4g-v24j + GHSA-3p4h-7m6x-2hcm (DoS deep nested + abort cleanup) | YES — 8 upload routes, all behind `requireRole(4)` + `requireTabAccess` + size caps (10-200MB)                  | **(C) ALLOWLIST có expiry** | Đã có MES-3-FIX-59 ticket, schedule sau 2026-08-29 freeze-end. Allowlist trong `security-allowlist.json` với expiry 2026-09-15. |

### Moderate (20) — bulk audit

Phần lớn từ Jest 29 transitive (`@jest/core` → js-yaml + cross-spawn cũ), exceljs uuid cascade. `npm audit fix` partial; fix đầy đủ yêu cầu Jest major bump (semver-major break risk). **Action:** allowlist với expiry 2027-Q1 cho Jest chain (đã planned bump). Riêng exceljs/uuid → check non-major fix availability.

### Low (1)

`@babel/core` GHSA-4x5r-pxfx-6jf8 (sourceMappingURL file read, CVSS 3.2) — dev-only, fixAvailable: true. `npm audit fix`.

---

## 3. Commit messages job

Đã CLOSED per MES-3-FIX-25 (commitlint config relaxed `footer-leading-blank: [0]`). Hiện green từ PR ~#117+ trở đi. **Không action cần thiết.**

---

## 4. Server tests job (1 chronic skip)

- `server/routes/backupCode.integration.test.js` `per-entry ETIMEDOUT is isolated` — SKIP per MES-3-FIX-51. Pass 10/10 isolation, fail trong full-suite. Suspect: fs.cpSync monkey-patch state leak.
- `server/http.integration.test.js` "Unable to deserialize cloned data" — MES-3-FIX-52 deferred. Node test-runner IPC framing race, 42/42 pass standalone.

**Nhóm:** (C) — pre-existing, deferred per ticket. **Trong Phase 0** không sửa; sẽ pick lên ở Hypercare 30d.

---

## 5. Workflow checks khác (đã green, không cần action)

- Runtime deps declared — green (MES-3-FIX-19 + #26 closed)
- Router has sibling tests — green
- Commit-msg hook smoke test — green
- Build artefacts — skipped on non-tag (intentional)
- Build installers — skipped on non-tag (intentional)

---

## Tổng hợp action plan cho Phase 0.2-0.5

### Phase 0.2 — react-compiler/hooks (priority HIGH)

- ~80 warnings client lint cần audit per-callsite (per MES-3-FIX-20 method từ 2026-05-09)
- **Gom theo loại vi phạm**, không theo file: (a) exhaustive-deps mount-only, (b) set-state-in-effect cascading-render real, (c) stale eslint-disable
- KHÔNG `// eslint-disable` hàng loạt — mỗi disable phải có `-- <reason>` comment
- **Estimated:** 1 ngày Henry

### Phase 0.3 — Audit cleanup

- `npm audit fix` → fixes 2 critical + 1 low (concurrently/shell-quote/@babel/core)
- `npm i -D @playwright/test@^1.61.0` → fixes 2 high (test-only)
- Tạo `security-allowlist.json` cho multer + Jest chain với expiry dates
- CI workflow check allowlist expiry hàng tuần
- **Estimated:** 0.5 ngày + 1 hardware smoke

### Phase 0.4 — Format pass (sau khi 0.2 + 0.3 land)

- 1 PR riêng `chore: prettier format-only run` — không trộn logic
- **Estimated:** 1h

### Phase 0.5 — Branch protection

- Bật require-status-checks + require-review trên `main`
- CODEOWNERS file cho 5 path tử huyệt: `client/src/services/calcEngine.js`, `client/src/services/pricingSnapshot.js`, `server/services/authService.js`, `server/services/permissionService.js`, `deploy.sh` + `deploy.ps1`
- Define break-glass policy: admin override allowed nhưng phải post-mortem trong 24h (file vào `docs/break-glass/<YYYY-MM-DD>.md`)
- **Estimated:** 0.5 ngày

### Phase 0 Gate Definition-of-Done

- 1 PR mới mở (test PR): CI **toàn xanh** (zero pre-existing red carry)
- Allowlist có expiry tối đa 90 ngày
- Branch protection enforced; admin-merge culture chấm dứt

---

## Refinements vs original Debug Playbook

| #   | Refinement                                                                                  | Lý do                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Step ordering 0.1 → 0.2 → 0.3 → **0.4 (Prettier) → 0.5**                                    | Prettier format-only PR cuối cùng vì 0.2 `eslint --fix` đã reformat phần lớn (eslint + prettier overlap nhiều rules). Chạy Prettier last tránh merge conflict |
| R-2 | E1 (duplicate license key) là **(A) ĐỎ THẬT**                                               | Original playbook assume react-compiler là nhóm chính — thực tế E1 là latent bug nghiêm trọng nhất; ESLint bắt đúng. Sửa kèm test pin contract                |
| R-3 | Multer keep (C) allowlist                                                                   | Đã investigated trong Phase A pre-go-live audit — ZERO của 3 advisories exploitable trong topology hiện tại. Bump dời post-go-live đúng                       |
| R-4 | Test-only deps (Playwright, Jest) cũng "non-runtime" nhưng vẫn fix khi có non-major fix sẵn | Giảm tổng count CVE → CI signal sạch hơn cho auditor                                                                                                          |

---

## Câu hỏi gate cho Phase 0.2-0.5

1. **Approve `npm audit fix`?** Đây là package-lock changes — không thay đổi code, nhưng nên smoke test `npm run dev` sau khi fix
2. **Branch protection bật ngay khi Phase 0 done, hay đợi Phase 1 (die-cut) cũng done?** Tôi recommend ngay sau Phase 0 vì culture switch effective ngay
3. **E1 fix nên ship riêng PR hay bundle vào Phase 0.2 cleanup?** Recommend riêng PR (1 commit, có test pin) để audit-trail rõ
