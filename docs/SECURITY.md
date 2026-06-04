# Security — Ops Control v1.3

> Tóm tắt các biện pháp bảo mật đã áp dụng trong v1.3, vị trí enforcement, và bằng chứng test.

## 1. Authentication

### Password hashing (argon2id)

- **Lưu ở:** `server/services/authService.js` (`bcryptHash`, `checkPassword`).
- **Hash format:** `$argon2id$v=19$m=65536,t=3,p=4$...`
- **Tham số:** memory 64 MiB, time 3 iterations, parallelism 4 — ≈80 ms/hash trên hardware 2026 (M-series / Xeon Skylake).
- **Migration ladder** (silent, transparent):
  - v1.2 `pwd_bcrypt` ($2a$…) → v1.3 `pwd_bcrypt` ($argon2id$…)
  - Legacy 32-bit `pwd` jsHash → argon2id
  - Idempotent dưới concurrent login (file lock + check `isArgonHash` trước rehash).
- **Test:** `server/services/authService.totpFailClosed.test.js` + `loginLockout.test.js` — 18/18 pass.

### Lockout

- **Policy:** 5 fails / 15 min. Persistent across server restart (SQLite-backed).
- **Lưu ở:** `server/services/authService.js` (`recordLoginAttempt`, `isLockedOut`).
- **Test:** `loginLockout.test.js` — verifies count, lockout window, automatic clearance.

### TOTP fail-closed

- **Mã hóa:** AES-256-GCM với `OPS_TOTP_KEY` (32 bytes hex, env-injected).
- **Fail mode:** key missing → REJECT. Decrypt fail → REJECT. Never fall through to "allow without TOTP".
- **Test:** `authService.totpFailClosed.test.js`.

### JWT cookie

- `HttpOnly`, `Secure` (when HTTPS — currently `dev` mode is plain HTTP), `SameSite=Strict`.
- HS256 signed với `JWT_SECRET` (≥ 256 bits).

## 2. Authorization

- **Server enforcement:** `requireRole(level)` middleware in `server/middleware/auth.js`. Role levels: viewonly=1, user=2, cost=3, admin=4, sys=5.
- **Client gating:** `useAuth().hasRole('admin')` for hide-in-UI (UX layer; defense-in-depth pairs with server).
- **Permission groups:** per-tab `hidden | read | edit` matrix; `permissionService.resolveTabAccess(user, tabId)`.

## 3. License (v1.3 NEW)

### Asymmetric Ed25519

- **Private key:** OFFLINE only at `~/OpsControl-license-keys/prod-private.pem` (license admin's box). Rotated 2026-06-04 — old in-repo dev key retired (private half had leaked via the public repo). Public fp `044e1ad7…`.
- **Public key:** baked into client app via `OPS_LICENSE_PUBKEY` env at build time, fallback `desktop/license.js:EMBEDDED_PUBKEY_PEM` (mirrored in `server/services/licenseService.js`).
- **Sign tool:** `scripts/license/generate-license.mjs` — CLI for CCL HQ ops.
- **Verify:** `desktop/license.js:verifyLicense()` (Electron) + `server/services/licenseService.js:getLicense()` (Node server).

### Tier enforcement

- Tier S=15, M=20, L=50 active users.
- **Server:** `requireSeatAvailable({ countActiveUsers })` middleware blocks `POST /api/users` with HTTP 402 when seats full.
- Soft-deleted users (`deleted_at IS NOT NULL`) DO NOT count.
- Sys recovery account DOES NOT count (protects recovery path from license lockout).
- **Test:** `server/services/licenseService.test.js` — 7/7 pass.

### Anti-bypass design

- Server check is independent of desktop check (server runs as forked node — own license verification).
- HMAC license keys (v1.2) are explicitly rejected — `verifyLicense` requires `version === 2`.
- Tier mismatch (`max_users !== TIER_LIMITS[tier]`) rejected before signature verify (cheap fail).

## 4. Content Security Policy

- **Where:** `desktop/main.js` `mainWindow.webContents.session.webRequest.onHeadersReceived`.
- **Policy:**
  ```
  default-src 'self'
  script-src  'self' 'unsafe-inline' 'unsafe-eval'   ← Vite + React dev needs eval; tightened in P5
  style-src   'self' 'unsafe-inline'                 ← Vite injects inline styles
  img-src     'self' data: blob:
  font-src    'self' data:
  connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* ws://127.0.0.1:*
  frame-src   'none'
  object-src  'none'
  base-uri    'self'
  form-action 'self'
  ```
- **Defense-in-depth:** `webSecurity: true`, `webviewTag: false`, `allowRunningInsecureContent: false`.

## 5. Navigation lockdown

- `mainWindow.webContents.on('will-navigate', ...)` — only allows `http://127.0.0.1`, `http://localhost`, `file://`. External URLs route via `shell.openExternal()`.
- `setWindowOpenHandler` — denies new windows; opens external in OS default browser.

## 6. Input validation

- `validate.js` middleware on every state-changing route.
- Path traversal: `safeFn()` in `server/services/authService.js` (regex `[^\w\s.-]` → `_`, capped 200 chars, dot-only names rejected).

## 7. Audit log

- **Append-only** `audit_log` SQLite table.
- **Retention:** monthly archive to gzipped JSON in `data/Library/Users/audit_log_archive/audit_YYYYMM.json.gz`.
- **Endpoint:** `GET /api/audit` (sys-only) — extracted to `server/domains/security/routes/audit.js` in P3.1.
- **Audited events:** login OK/fail, password change, role change, permission group change, cylinder add/delete, sys recovery, TOTP enroll/rotate.

## 8. Dependency vulnerability gate

| Package    | Pre-v1.3                      | Post-v1.3                       |
| ---------- | ----------------------------- | ------------------------------- |
| `desktop/` | 10 high                       | **0**                           |
| `client/`  | 1 moderate                    | **0**                           |
| `root/`    | 2 moderate (uuid via exceljs) | 2 moderate (dev-only, accepted) |

CI workflow `.github/workflows/ci.yml` runs `npm audit --audit-level=high` on push/PR — high vulns block merge.

## 9. What is NOT in v1.3 (deferred)

| Item                        | Why deferred                               | Tracked in                                   |
| --------------------------- | ------------------------------------------ | -------------------------------------------- |
| TLS / mTLS Client–Server    | Needs cert lifecycle plan + self-signed UX | v1.3.1 backlog                               |
| `costApi.js` full split     | 2891 LOC; multi-week scope                 | per-sprint pull-out                          |
| `exceljs` moderate vuln fix | Requires major downgrade to 3.4            | upstream wait                                |
| Windows `.exe`              | No Windows host or Wine                    | CI workflow has `windows-latest` matrix path |

## 10. Audit checklist (review before next release)

- ☐ `npm audit` clean on all 3 packages (high+).
- ☐ Server tests pass (`npm test`).
- ☐ Client tests pass (`cd client && npm test`).
- ☐ License tests pass (`node --test desktop/license.test.js server/services/licenseService.test.js`).
- ☐ CSP headers verified (`curl -I http://localhost:3000`).
- ☐ Bundle marker grep on each DMG (after Sprint v1.3.1 adds it).
- ☐ Documentation reviewed (this file + ARCHITECTURE.md + MIGRATION_GUIDE.md).
