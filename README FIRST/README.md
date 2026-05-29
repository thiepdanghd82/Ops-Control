# Ops Control v1.3

> CCL Design Vietnam — Pricing + Planning + MES backbone for printing operations.
> Web SPA (React 19 + Vite) · API (Express + better-sqlite3) · Desktop shell (Electron).

**v1.3 is an architectural reset.** Same business logic, same SAP/IFS-inspired UX, same dual
client/server installers — but the source tree is reorganised around **bounded contexts** and a
**platform layer**, with AI-agent configuration aligned to the production-grade workflow defined
in `3. PROJECTS/README.md`.

The behaviour shipped in v1.2 (Sprint 1.7j — Master Cylinder admin controls) is preserved as the
functional baseline. v1.3 changes WHERE code lives, not WHAT it does.

---

## Why v1.3 exists

By the end of v1.2 the repository hit several scale limits familiar to anyone who has shipped a
SAP/IFS-class app:

| Symptom (v1.2)                                                    | Root cause                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `client/src/modules/cost/tabs/` had 30+ unrelated `.jsx` files    | "Cost" was used as a junk drawer for every non-planning tab   |
| `server/routes/costApi.js` exceeded ~3 000 LOC                    | All HTTP handlers — pricing, library, master-data — colocated |
| `i18n/strings.js` was a single ~5 000-line module                 | No per-domain ownership of translation keys                   |
| `scripts/` mixed build, recovery, migration and dev tools         | No separation by purpose or audit risk                        |
| `.claude/` only contained `launch.json`                           | Agent workflow not codified                                   |
| Cross-cutting concerns (ETag, audit, sync) lived next to features | Hard to reuse across domains, easy to fork accidentally       |

v1.3 fixes those by adopting the **vertical-slice / bounded-context** layout used in mature ERPs
(SAP modules CO/MM/PP/SD/QM/HR/BC; IFS _components_).

---

## High-level layout

```
Ops Control v1.3/
├── .claude/              AI agent configuration (commands, agents, rules, skills, references)
├── apps/                 Deployment shells — thin entry points
│   ├── client/             React SPA (Vite) — boots and mounts domain UIs
│   ├── server/             Express server — boots and mounts domain routers
│   └── desktop/            Electron shell — wraps client+server installers
├── domains/              Bounded contexts (vertical slices)
│   ├── costing/            CO  — Standard/Complex calc, Print Area, Ink, Design Tools
│   ├── library/            MM  — Material, Rate, Finance, DDL, Mfg Structure, Routing Ops
│   ├── planning/           PP  — Order Entry, WIP, Capacity, BOM Explosion, Material Check
│   ├── sales/              SD  — RFQ Tracker, Quote History, Quote Analysis, Formal Quotation
│   ├── quality/            QM  — Sample Tracking
│   ├── security/           SU  — Auth, Users, Permission Groups, Audit, Approvals
│   ├── basis/              BC  — Settings, Backup, Sync, Notifications, Health, Import
│   └── mes/                MES — IFS Inventory, Machine Technical, Hardware, Mode
├── platform/             Cross-cutting capabilities (no business logic)
│   ├── auth/  audit/  cache/  sync/  i18n/  ui-kit/  http/  storage/  observability/
├── data/                 Runtime data (Library JSON store, SQLite, Backup, Layouts)
├── docs/                 ADRs, runbooks, sprints, user guide
├── scripts/              Build / ops / migrations / dev (split by purpose)
├── tests/                e2e / perf / fixtures (cross-domain only — unit tests live with code)
└── infra/                ci / deploy / installers
```

Each `domains/<name>/` mirrors the same shape:

```
domains/costing/
├── client/      React components + hooks + styles (was client/src/modules/cost/tabs/...)
├── server/      Express router + services + repositories
├── shared/      Types, constants, validation schemas (importable from both sides)
├── tests/       Domain-scoped unit + integration tests
└── README.md    Bounded-context description, owners, key invariants
```

---

## Modules → SAP analogue

| Module       | Analogue  | Owns                                                                                         |
| ------------ | --------- | -------------------------------------------------------------------------------------------- |
| **costing**  | SAP CO    | Standard/Complex pricing, Print Area, Ink, Design Tools (Gallus calc, Master Cylinder)       |
| **library**  | SAP MM    | Master data: Materials, Rates, Finance, DDL, Mfg Structure, Routing Ops, Machine Profiles    |
| **planning** | SAP PP    | Order Entry, Work Orders, WIP Tracker, Capacity Planning, BOM Explosion, Material Check      |
| **sales**    | SAP SD    | RFQ Tracker, Quote History, Quote Analysis, Formal Quotation, Released Quotation             |
| **quality**  | SAP QM    | Sample Tracking                                                                              |
| **security** | SAP SU/HR | Auth (login, TOTP, lockout), Users, Permission Groups, Audit log, Approval Workflow          |
| **basis**    | SAP BC    | Settings, Backup/Restore + Schedule, Sync (Smart/Thin), Notifications, Import wizard, Health |
| **mes**      | MES/PLM   | IFS Inventory mirror, Machine Technical, Hardware Devices, Connection Mode                   |

---

## Tech stack (unchanged from v1.2)

| Layer        | Tech                                                         |
| ------------ | ------------------------------------------------------------ |
| Frontend     | React 19, Vite, lazy/Suspense, useDeferredValue              |
| State / data | Hooks + SWR-style cached fetch (`platform/cache`)            |
| Styling      | Plain CSS modules per component (IBM Carbon-aligned)         |
| i18n         | Custom `useI18n()` hook, dot-namespaced keys, EN/VN          |
| Backend      | Express 4, better-sqlite3, JSON-on-disk shadow-write         |
| Auth         | bcrypt + AES-256-GCM TOTP + JWT cookie                       |
| Desktop      | Electron + electron-builder (CLIENT/SERVER variants)         |
| Tests        | `node --test` for server, Jest for shared, Vitest for client |
| Build        | `vite build` for client, `electron-builder` for installers   |

> v1.3 does NOT switch to Next.js / Prisma / Postgres (the README's _recommended_ stack). The
> production deployment is a small-LAN, on-prem app with one admin per site — Postgres + Redis
> would add ops burden without payback. ADR-0001 records this decision.

---

## Quick start

```bash
# Install root + workspace deps
npm install

# Dev (concurrent client + server)
npm run dev

# Build client bundle
npm run build

# Build desktop installers (Mac arm64 + Win x64, both CLIENT and SERVER)
npm run desktop:build:all

# Verify (lint + build + perf budget + tests)
npm run verify
```

See [docs/runbooks/dev-setup.md](docs/runbooks/dev-setup.md) for first-time setup, including
`.env` provisioning and SQLite initialisation.

---

## Migration from v1.2

v1.3 is a parallel project — v1.2 is **not** modified. To port a v1.2 change:

1. Find its destination in [MIGRATION.md](MIGRATION.md) (file-by-file map).
2. Move the file into the target domain or platform package.
3. Update imports — most v1.2 paths become `@domains/<name>/...` or `@platform/...`.
4. Add a row to [CHANGELOG.md](CHANGELOG.md) under `v1.3.0-beta`.

The migration is staged across sprints — see [docs/sprints/v1.3-migration-plan.md](docs/sprints/v1.3-migration-plan.md).

---

## AI agent workflow

`.claude/` is configured per the production-grade pattern in `3. PROJECTS/README.md`:

| Slash command | Phase            |
| ------------- | ---------------- |
| `/spec`       | PRD              |
| `/plan`       | Decompose        |
| `/build`      | Implement (TDD)  |
| `/test`       | Verify           |
| `/review`     | Five-axis review |
| `/deploy`     | Ship             |

Specialised agents live in `.claude/agents/` (frontend, backend, systems-architect, code-reviewer,
test-engineer, security-auditor, qa, project-manager, ui-ux-designer, copywriter-seo).

Mandatory rules in `.claude/rules/` are loaded into every session — the most important is
`security.md`, which encodes the auth/audit invariants that v1.2 hardened across Sprints 1.5–1.7.

---

## Documentation index

| Doc                                  | Audience                                 |
| ------------------------------------ | ---------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)   | Engineers — module map, dependency rules |
| [MIGRATION.md](MIGRATION.md)         | Engineers — v1.2 → v1.3 file mapping     |
| [CLAUDE.md](CLAUDE.md)               | AI agents — entry-point context          |
| [CHANGELOG.md](CHANGELOG.md)         | Everyone — release history               |
| [docs/adr/](docs/adr/)               | Engineers — architecture decisions       |
| [docs/runbooks/](docs/runbooks/)     | Ops — DR, backup, recovery procedures    |
| [docs/user-guide/](docs/user-guide/) | End users — bilingual EN/VN guide        |
| [docs/sprints/](docs/sprints/)       | Engineers + PMs — sprint history         |

---

## License & ownership

Internal — CCL Design Vietnam. Not for redistribution.
Maintainer: Thiep Dang (`thiepdangthe@gmail.com`).
