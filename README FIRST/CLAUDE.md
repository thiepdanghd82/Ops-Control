# CLAUDE.md — Ops Control v1.3

> Entry-point context for AI agents (Claude Code, Claude Agent SDK).
> Keep this file under ~600 lines. Deeper context lives in `docs/` and `.claude/`.

## What this project is

Internal pricing + planning + MES backbone for **CCL Design Vietnam** (printing operations).
Web SPA + Express API + Electron desktop shell. Two installers per platform:

- **CLIENT** installer — bundles UI + connects to a remote SERVER (or runs in `embedded` mode).
- **SERVER** installer — runs the API, owns the data, hosts the SQLite + JSON store.

Connection modes (from `domains/mes/`): `embedded` · `thin` · `smart`.

## What v1.3 changed vs v1.2

**Architecture, not behaviour.** Same business logic, same UX, same installers — but the source
tree is reorganised around bounded contexts (domains) and a platform layer. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the full rationale and [MIGRATION.md](MIGRATION.md) for
file-by-file mapping.

**Auto-mode prompt for AI agents:** when the user asks for a change, locate the affected
**domain** first, then decide whether the change belongs in `client/`, `server/`, `shared/`, or
`tests/` of that domain. If you find yourself wanting to add code to two domains at once, lift
the shared piece to `platform/`.

## Where things live (quick lookup)

| You want to touch…              | Look in…                                             |
| ------------------------------- | ---------------------------------------------------- |
| Cost calculator (Std / Cpx)     | `domains/costing/`                                   |
| Print Area / Ink / Design Tools | `domains/costing/client/{print-area,ink,design-tools}/` |
| Master cylinder admin           | `domains/costing/{client,server}/design-tools/master-cylinder/` |
| Material / Rate / Finance / DDL | `domains/library/`                                   |
| Manufacturing structure / Routing Ops | `domains/library/client/{mfg-structure,routing-ops}/` |
| Order Entry / WIP / Capacity    | `domains/planning/`                                  |
| RFQ Tracker / Quote History     | `domains/sales/`                                     |
| Quote Analysis (Carbon redesign)| `domains/sales/client/quote-analysis/`               |
| Sample Tracking                 | `domains/quality/`                                   |
| Login, TOTP, lockout            | `platform/auth/`                                     |
| Permission Groups, Approvals    | `domains/security/`                                  |
| Settings, Backup schedule       | `domains/basis/client/settings/`                     |
| Dashboard, Admin Metrics        | `domains/basis/client/{dashboard,admin-metrics}/`    |
| Hardware Devices, Connection Mode | `domains/mes/client/{hardware,mode}/`              |
| IFS Inventory, Machine Technical| `domains/mes/client/{ifs-inventory,machine-technical}/` |
| ETag, SWR cached fetch          | `platform/cache/`                                    |
| Sync / Smart-mode               | `platform/sync/`                                     |
| Shared React UI (Button, Modal) | `platform/ui-kit/`                                   |
| Validate / rate-limit middleware| `platform/http/`                                     |
| Atomic file writes / SQLite     | `platform/storage/`                                  |
| Audit log                       | `platform/audit/`                                    |
| i18n (per-domain)               | `domains/<name>/shared/i18n.js` + `platform/i18n/`   |

## Conventions you must follow

### Imports

Workspace aliases (configured in root `tsconfig.base.json` + Vite alias):

| Alias                | Resolves to              |
| -------------------- | ------------------------ |
| `@apps/*`            | `apps/*`                 |
| `@domains/*`         | `domains/*`              |
| `@platform/*`        | `platform/*`             |
| `@data/*`            | `data/*` (server-side only) |

Never import via deep relative paths (`../../../platform/...`). If your editor suggests one,
rewrite it as an alias.

### Domain isolation

- A domain MUST NOT import from another domain.
- A domain MAY import from `platform/*` and from its own `shared/`.
- `platform/*` MUST NOT import from any domain.

`eslint-plugin-boundaries` will reject violations at lint time.

### File naming

| Kind                          | Pattern                          |
| ----------------------------- | -------------------------------- |
| React component               | `PascalCase.jsx` + `PascalCase.css` |
| Hook                          | `useThing.js`                    |
| Domain pure logic             | `camelCase.js` (no React, no Express) |
| Service (orchestration)       | `nameService.js`                 |
| Repository                    | `nameStore.js` or `nameRepo.js`  |
| Route                         | `nameRouter.js` (export `router`) |
| Test                          | `<sibling>.test.js` (node --test) |
| Integration test              | `<feature>.integration.test.js`  |

### i18n

- Strings live next to the domain that owns them: `domains/<name>/shared/i18n.js`.
- Each i18n module exports `{ register }` which calls `platform/i18n/registry.js`.
- The shell (`apps/client/src/main.jsx`) imports each domain's `i18n.js` once at boot.
- Keys are dot-namespaced by domain: `costing.standard.title`, `sales.qh.contr_pct`, etc.
- The shape per key is always `{ en: '...', vi: '...' }`.

### Tests

- Unit tests run with `node --test` (server-side) or Vitest (client-side).
- Integration tests file-suffix `*.integration.test.js`, run by the same runner.
- Cross-domain e2e lives in `tests/e2e/` (Playwright).
- Perf budgets in `tests/perf/`. The CI gate is `npm run perf-budget`.

### Commits & branches

- Conventional Commits: `feat(domain): ...`, `fix(platform): ...`, `chore: ...`, `docs: ...`.
- Branch per sprint: `sprint/v1.3.X-<short-name>`.
- Squash-merge to `main`. The squash commit message follows the same convention.

## Operational invariants (never break)

These were learned the hard way in v1.2 (Sprints 1.5–1.7). Re-violating any of them is a
regression, not a refactor.

1. **Soft-delete filter on read paths.** Any iteration over quotes / approvals must skip records
   with a non-null `deleted_at`. (Lost in v1.2 → Sidebar approval badge stuck on 1.)
2. **Atomic writes for the JSON Library.** Always go through `@platform/storage` —
   `atomicWriteFileSync` + `proper-lockfile`. Never raw `fs.writeFileSync`.
3. **Audit dual-write on every admin mutation.** `CYLINDER_ADD`, `CYLINDER_DELETE`, etc. — the
   pattern is set in `domains/costing/server/services/cylinderService.js`.
4. **TOTP fail-closed.** If TOTP can't be verified (e.g., key missing), reject — don't allow.
5. **Drawing fetch errors must be visible.** `FileUploadZone` shows an amber error block; do
   not swallow into silent catch.
6. **MOQ Setup data per tier.** Each MOQ row stores its own `setupLm` / `setupHr`. Empty cells
   render as `null`, never as the base value.
7. **Path traversal check on `/layout/:filename`.** Use the platform helper, never strip-and-hope.
8. **Role check for admin-only UI.** Hide in client (`hasRole('admin')`) AND enforce on server
   (`requireRole('admin')` middleware).
9. **Defer big lists with `useDeferredValue`.** Sidebar tab switches must stay snappy even when
   the active tab loads 16 MB of Routing Ops.
10. **MERGE-don't-overwrite on `.env` deploy.** `infra/deploy/deploy.sh` already does this — keep it.

## What NOT to do

- Don't introduce a new top-level domain unless you can name its SAP analogue.
- Don't add a "shared" folder inside a domain pointing to another domain's code — lift to platform.
- Don't bring in Postgres / Redis / Next.js without an ADR. The README's recommended stack is
  suitable for SaaS apps; v1.3 is on-prem LAN.
- Don't reintroduce the monolithic `i18n/strings.js`. Per-domain registration is mandatory.
- Don't add any business logic into `apps/*`. Apps are wiring only.
- Don't write barrel files (`index.js` re-exports) at `domains/*/` level — they hide
  cross-domain leaks. Use explicit named imports.

## Slash commands available

`/spec` `/plan` `/build` `/test` `/review` `/deploy` `/debug` `/simplify` `/fix-issue`

Each is defined in `.claude/commands/`. Read those before invoking.

## Specialised agents

`.claude/agents/` (10 personas — see [README.md](README.md) §"Specialized Agents"). The most
commonly invoked here:

- **systems-architect** — when changing module boundaries or platform contracts
- **security-auditor** — any auth / TOTP / audit / approval change
- **code-reviewer** — five-axis review before merge
- **frontend** — React 19 + Vite + Carbon idioms
- **backend** — Express + better-sqlite3 + JSON-on-disk

## Sprint history

`docs/sprints/` retains the full v1.2 history (Sprint 1.0 through Sprint 1.7j) plus v1.3
migration sprints from 1.3.0 onwards.

## Memory checklist

When you (the AI) work on this repo, update memory if any of these change:

- A new domain is added → record its ownership and SAP analogue.
- A platform package gains a new public export → it becomes a candidate for "look here first".
- A long-standing invariant changes → update the list above AND the corresponding ADR.
- Build/deploy script paths move → update `package.json` AND the runbook.

Memory entries should pin to absolute v1.3 paths (this folder), not v1.2.
