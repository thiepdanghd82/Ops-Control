# Architecture — Ops Control v1.3

> Sơ đồ kiến trúc Client–Server v1.3 (sau autonomous upgrade pass).

## 1. High-level

```mermaid
flowchart LR
  subgraph LAN[CCL Plant LAN]
    direction LR
    subgraph SRV[macOS / Windows · SERVER edition]
      ES[Electron shell]
      ES --> NS[Node server :3000]
      NS --> SQ[(better-sqlite3<br/>data/ops-control.sqlite)]
      NS --> JS[(JSON Library<br/>data/library/*)]
      NS --> AU[(Audit log<br/>data/Library/Users/audit_log.json)]
      NS --> LIC[license.json<br/>v2 Ed25519]
    end
    subgraph CL1[macOS · CLIENT edition]
      EC1[Electron shell]
      RC1[React 19 SPA]
      EC1 --> RC1
    end
    subgraph CL2[macOS · CLIENT edition]
      EC2[Electron shell]
      RC2[React 19 SPA]
      EC2 --> RC2
    end
    RC1 -- HTTP /api/* --> NS
    RC2 -- HTTP /api/* --> NS
  end
  subgraph HQ[CCL HQ - offline]
    PRIV[Ed25519 private key]
    GEN[scripts/license/generate-license.mjs]
    PRIV --> GEN
  end
  GEN -.->|email license.json| LIC
```

## 2. Layer model (server side)

```
┌─────────────────────────────────────────────────────────────┐
│  apps/                  electron + node entry points         │
│  └── desktop/main.js    Electron, forks node server          │
│  └── server/index.js    Express boot, mounts routers         │
├─────────────────────────────────────────────────────────────┤
│  domains/               bounded contexts (in-progress migration)│
│  ├── security/          users, audit, permission groups      │
│  ├── costing/           Standard/Complex/Print/Ink/Design    │
│  ├── library/           Material/Rate/Finance/DDL/Mfg/Routing│
│  ├── sales/             RFQ/Quote/Analysis/Formal            │
│  ├── planning/          Order/WIP/Capacity/BOM               │
│  ├── quality/           Sample tracking                      │
│  ├── basis/             Settings/Backup/Health/Sync          │
│  └── mes/               IFS/Hardware/Connection mode         │
├─────────────────────────────────────────────────────────────┤
│  platform/              cross-cutting (no business logic)    │
│  ├── auth/              argon2id, JWT, TOTP                  │
│  ├── audit/             append-only audit store              │
│  ├── http/              middleware (auth, rateLimit, validate)│
│  ├── storage/           atomic write, lockfile, sqlite       │
│  └── i18n/              registerStrings() + per-domain modules│
└─────────────────────────────────────────────────────────────┘

  Dependency rule:  apps → domains → platform     (never reverse)
                              ╲────→ platform
```

## 3. Tech stack

| Layer    | Tech                                                           | Version     |
| -------- | -------------------------------------------------------------- | ----------- |
| Frontend | React 19 + Vite 8 + react-router-dom 6                         | latest      |
| Backend  | Express 4 + better-sqlite3 12                                  | latest      |
| Auth     | argon2id (`argon2`) + JWT cookie + TOTP AES-256-GCM            | argon2 0.44 |
| License  | Ed25519 (`node:crypto`)                                        | –           |
| Desktop  | Electron 38+ + electron-builder 26                             | latest      |
| Native   | `serialport`, `node-hid`, `pdf-to-printer`, `electron-store 8` | unchanged   |
| Test     | `node:test` (server) + Jest 29 (root) + `node:test` (client)   | –           |
| Lint     | ESLint 9 (flat config) + Prettier 3                            | –           |
| CI       | GitHub Actions 5 jobs                                          | –           |

## 4. Auth flow

```mermaid
sequenceDiagram
  participant User
  participant Client as React SPA
  participant Server as Express server
  participant DB as users.json
  User->>Client: username + password
  Client->>Server: POST /api/auth/login
  Server->>DB: read user
  alt Hash starts with $argon2id$
    Server->>Server: argon2.verify(plain, hash)
  else Hash starts with $2[aby]$ (legacy bcrypt)
    Server->>Server: bcryptjs.compareSync(plain, hash)
    Server->>Server: rehash with argon2id
    Server->>DB: write new $argon2id$ hash
  end
  alt TOTP enabled
    Server-->>Client: 401 + totp_required
    User->>Client: 6-digit code
    Client->>Server: POST /api/auth/login + totp
    Server->>Server: verify TOTP (AES-256-GCM)
  end
  Server-->>Client: 200 + JWT cookie (HttpOnly, Secure, SameSite=Strict)
```

## 5. License flow

```mermaid
sequenceDiagram
  participant Customer as Customer plant manager
  participant App as Ops Control SERVER edition
  participant HQ as CCL HQ ops
  Customer->>App: First-run setup wizard
  App->>App: Hash machine fingerprint (SHA-256)
  App-->>Customer: Display Installation ID
  Customer->>HQ: Email Installation ID + customer name + tier
  HQ->>HQ: scripts/license/generate-license.mjs --installation-id ... --tier M
  HQ->>HQ: sign(canonicalize(payload), Ed25519 private key)
  HQ-->>Customer: license.json
  Customer->>App: Paste license JSON in wizard
  App->>App: verify(canonicalize(payload), pubkey, signature)
  App->>App: Check installation_id matches local fingerprint
  App->>App: Check expires_at > now
  App-->>Customer: License OK · tier M · 20 users
```

## 6. License tier enforcement

`POST /api/users` middleware chain:

```
authMiddleware → requireRole('admin') → requireSeatAvailable() → handler
                                              │
                                              ├─ getLicense() → tier, max_users
                                              └─ countActiveUsers() (excludes soft-deleted, sys)
                                              if (active >= max_users)
                                                return 402 LICENSE_LIMIT_EXCEEDED
```

## 7. CSP layers

```mermaid
flowchart LR
  Req[HTTP response] --> WR[onHeadersReceived]
  WR --> CSP[Inject CSP header]
  CSP --> default["default-src 'self'"]
  CSP --> script["script-src 'self' 'unsafe-inline' 'unsafe-eval'"]
  CSP --> style["style-src 'self' 'unsafe-inline'"]
  CSP --> img["img-src 'self' data: blob:"]
  CSP --> conn["connect-src 'self' http://127.0.0.1:* http://localhost:*"]
  CSP --> frame["frame-src 'none'"]
  CSP --> obj["object-src 'none'"]
```

## 8. Build pipeline

```mermaid
flowchart TB
  src[Source<br/>client/src + server/]
  build1[npm run build<br/>vite build]
  build2[electron-builder]
  src -->|client| build1 -->|client/dist| build2
  src -->|server + scripts + node_modules| build2
  build2 --> dmg1[OpsControl-CLIENT-mac-arm64.dmg]
  build2 --> dmg2[OpsControl-CLIENT-mac-x64.dmg]
  build2 --> dmg3[OpsControl-SERVER-mac-arm64.dmg]
  build2 --> dmg4[OpsControl-SERVER-mac-x64.dmg]
  dmg1 --> sha[shasum -a 256 → checksums.txt]
  dmg2 --> sha
  dmg3 --> sha
  dmg4 --> sha
```

## 9. ADR (architecture decisions)

| #    | Decision                                                   | Why                                                         |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| 0001 | Keep on-prem stack (Express + better-sqlite3 + JSON store) | LAN deploy, no SaaS payback                                 |
| 0002 | argon2id over bcrypt                                       | OWASP top recommendation, GPU-resistant                     |
| 0003 | Ed25519 license signing                                    | Asymmetric → leaked client install can't sign fake licenses |
| 0004 | License tier S/M/L = 15/20/50                              | Per IMPROVEMENT_BRIEF.md ¶4.5                               |
| 0005 | electron-builder over Tauri                                | Native module compatibility, 0 migration cost               |
| 0006 | In-place v1.2 hardening (not v1.3 layout port)             | No git repo; rewrite would multi-week                       |
