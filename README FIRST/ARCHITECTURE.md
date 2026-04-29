# Architecture — Ops Control v1.3

## 1. Goals of the v1.3 reset

| Goal                                          | How v1.3 achieves it                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| Domain ownership of code                      | `domains/<name>/` vertical slices, mirrored client + server   |
| Reusable cross-cutting capabilities           | `platform/` packages (no business logic)                      |
| Thin deployment shells                        | `apps/{client,server,desktop}` only boot + mount, never own logic |
| Predictable file location                     | Folder name = SAP module letter (CO, MM, PP, SD, QM, SU, BC, MES) |
| Test colocation + cross-domain test discipline| Unit/integration tests in `domains/*/tests/`; e2e + perf in root `tests/` |
| Documentation people will actually read       | One README per domain, ADRs for decisions, runbooks for ops   |

## 2. Layer model

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/                       deployment shells (entry points)    │
│  ─────                       boot, mount routers / mount React   │
├──────────────────────────────────────────────────────────────────┤
│  domains/                    bounded contexts (business logic)   │
│  ─────────                   each owns: client, server, shared,  │
│                              tests, README                       │
├──────────────────────────────────────────────────────────────────┤
│  platform/                   cross-cutting capabilities          │
│  ──────────                  no business knowledge — auth, audit,│
│                              cache, sync, i18n, ui-kit, http,    │
│                              storage, observability              │
├──────────────────────────────────────────────────────────────────┤
│  data/                       runtime state                       │
│  ─────                       JSON Library, SQLite shadow, Backup │
└──────────────────────────────────────────────────────────────────┘
```

### Dependency rule

```
  apps  ──►  domains  ──►  platform
                     ╲────►  platform
                  (never reverse)
```

- A domain MAY import from `platform/*` and from its own `shared/`.
- A domain MUST NOT import from another domain — if two domains need the same thing, lift it to
  `platform/` or to a new shared abstraction.
- `platform/` MUST NOT import from any `domain/` or `app/`.
- `apps/` MAY import from any `domain/` or `platform/`.

ESLint enforces this via `eslint-plugin-boundaries` (configured in `tools/eslint-config/`).

## 3. Domain anatomy

Every `domains/<name>/` follows the same shape:

```
domains/costing/
├── README.md            What this domain owns, key invariants, owners
├── client/
│   ├── components/      Page + view components
│   ├── hooks/           Domain-specific React hooks
│   ├── pages/           Top-level routed pages (mounted by apps/client)
│   └── styles/          CSS modules
├── server/
│   ├── routes/          Express router (mounted by apps/server)
│   ├── services/        Use cases / orchestration
│   ├── repositories/    Data access (file + SQLite)
│   └── domain/          Pure business logic — engine, formulas, validators
├── shared/
│   ├── types/           TypeScript-style JSDoc types or .d.ts
│   ├── constants/       Magic numbers, enum values
│   └── schema/          Validation schemas (used both sides)
└── tests/
    ├── unit/
    └── integration/
```

The pure-logic engine (e.g. `gallusEngine.js`, `calcStandard.js`) lives under `server/domain/`
because it has no UI dependency, even though it ships in the client bundle. The client imports it
via the workspace alias.

## 4. Platform packages

Each `platform/<name>/` is a standalone package with its own `package.json`:

| Package         | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `auth`          | Login, bcrypt, TOTP (AES-256-GCM), JWT cookie, lockout, anomaly detection |
| `audit`         | Append-only audit store + retention sweeper                               |
| `cache`         | HTTP ETag helper (server) + SWR cached fetch + persistent snapshot (client) |
| `sync`          | Smart-mode/Thin-mode sync engine, dataset replication                     |
| `i18n`          | `useI18n()` hook + per-domain string registration (no monolithic file)    |
| `ui-kit`        | Shared React components (Button, Modal, Badge, FlagToggle, Skeleton, etc.) |
| `http`          | Express middleware: validate, rateLimit, siteAccess, errorEnvelope        |
| `storage`       | Atomic file writes, lockfile helpers, SQLite shadow-write coordinator     |
| `observability` | Metrics, structured logging, perf budget probes                           |

## 5. Apps (deployment shells)

Apps are deliberately tiny — they exist to wire domain modules into a deployable artefact.

### `apps/server/`

```js
// apps/server/index.js — entry point only
import express from 'express';
import { createAuthMiddleware } from '@platform/auth';
import { mountCosting } from '@domains/costing/server';
import { mountLibrary } from '@domains/library/server';
// …
const app = express();
app.use(createAuthMiddleware());
mountCosting(app);
mountLibrary(app);
// …
app.listen(process.env.PORT);
```

### `apps/client/`

`apps/client/src/App.jsx` is a router shell. Each route lazy-imports a domain `pages/` module.
Sidebar items, badges, and i18n strings are registered by domains at boot — the shell does not
hardcode them.

### `apps/desktop/`

Wraps `apps/client` (CLIENT installer) or `apps/server` (SERVER installer). Same Electron config
as v1.2, just relocated.

## 6. Data directory

`data/` matches what was `server/data/` in v1.2:

| Subfolder            | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `library/`           | JSON-on-disk store (DDL, Finance, Material, Rate, etc.)       |
| `library/SystemConfig/` | Master cylinder admin overrides, schedule config, etc.    |
| `backup/`            | Backup snapshots (Code + Data subtrees)                       |
| `planning/`          | Planning module persisted state                               |
| `products-layout/`   | Layout PDF/PNG uploads                                        |

The path is resolved via `@platform/storage` so domains never hardcode it.

## 7. Tests

Three layers:

| Where                         | What                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `domains/*/tests/`            | Unit + integration tests for that domain only           |
| `platform/*/...test.js`       | Tests colocated with the platform package source        |
| `tests/e2e/`                  | Cross-domain end-to-end (Playwright)                    |
| `tests/perf/`                 | Performance budgets (bundle size, paint timings)        |

`npm test` runs all three. `npm test -- --domain=costing` runs one domain only.

## 8. AI agent layer

`.claude/` is loaded by Claude Code at session start. The structure mirrors the README pattern:

| Folder        | Contents                                                    |
| ------------- | ----------------------------------------------------------- |
| `commands/`   | Slash commands (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/deploy`, `/debug`, `/simplify`) |
| `agents/`     | Specialised agent personas (10 — frontend, backend, architect, reviewer, test-engineer, security-auditor, qa, pm, ui-ux, copywriter) |
| `rules/`      | Mandatory rules (clean-code, code-style, error-handling, tech-stack, system-design, project-structure, api-conventions, naming, database, security, monitoring, testing, git-workflow) |
| `skills/`     | TDD, code-review, incremental-implementation, deploy, security-review |
| `references/` | Quick checklists (security, testing, performance, accessibility) |

`CLAUDE.md` at the repo root pulls these in and adds project-specific context (paths, conventions,
SAP-module mapping).

## 9. Decision log (ADRs)

Architecture decisions live in `docs/adr/` as numbered Markdown files. v1.3 ships with:

| ADR | Title                                                       |
| --- | ----------------------------------------------------------- |
| 0001 | Keep on-prem stack (Express + better-sqlite3 + JSON store) |
| 0002 | Adopt domain-driven vertical slicing                       |
| 0003 | Platform layer for cross-cutting capabilities              |
| 0004 | Per-domain i18n registration (no monolithic strings file)  |
| 0005 | npm workspaces (no Turborepo / Nx until pain warrants)     |

New decisions get a new ADR. Superseded ADRs are marked, not deleted.
