# Release notes — Ops Control v1.3.0-beta.1

**Date:** 2026-04-28
**Type:** Beta release — feature-complete vs the alpha scope, plus extensive UI port from v1.2.
**Codename:** _bounded contexts → operator beta_.

---

## What this release is

The architectural reset from `v1.3.0-alpha.0` is now backed by a **functionally usable
operator surface**. All 8 bounded contexts have ≥ 2 client screens, all 5 P0 release-blockers
plus the P1 backlog are closed, and 12+ v1.2 UIs have been ported to the new architecture.

```
apps  ──►  domains  ──►  platform        (enforced by ESLint boundaries)
                     ╲────►  platform
                  (never reverse)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for rationale and [MIGRATION.md](MIGRATION.md) for the
v1.2 → v1.3 file-by-file mapping. [CHANGELOG.md](CHANGELOG.md) has per-sprint detail.

---

## What's new since `1.3.0-alpha.0`

### Sprints 1.3.7 – 1.3.12 — closed all 5 P0 release-blockers

Complex calc + router + quote persistence + Permission Groups + siteAccess + Desktop
installers. See [CHANGELOG.md](CHANGELOG.md) for sprint-level detail.

### Sprints 1.3.13 – 1.3.22 — operator UI build-out

Ten contained sprints that took the read-only architectural skeleton up to a working
operator surface. Highlights:

| Sprint | Domain   | What landed                                                     |
| ------ | -------- | --------------------------------------------------------------- |
| 1.3.13 | costing  | PrintArea calc form, Ink calc form (live recompute, 16 tests)   |
| 1.3.13 | basis    | AuditLogViewer (sys), SettingsView (admin)                      |
| 1.3.14 | library  | MfgStructure + RoutingOps browsers (read-only)                  |
| 1.3.15 | basis    | AdminMetrics dashboard (Prometheus parser, 16 tests)            |
| 1.3.16 | mes      | IFSInventory browser (server-side filters, debounced)           |
| 1.3.17 | sales    | QuoteTrash modal + restoreQuote endpoint (4 tests)              |
| 1.3.18 | planning | WIPTracker (kanban) + CapacityBoard (ISO-week buckets, 2 tests) |
| 1.3.19 | mixed    | OrderEntryForm; admin per-row Quote Delete                      |
| 1.3.20 | library  | Material admin CRUD UI (add/edit/delete modal)                  |
| 1.3.21 | quality  | Sample New + state-transition modals (with reject reason)       |
| 1.3.22 | library  | Rate + Finance constants admin CRUD UIs                         |

### Cross-cutting fix

- **`verifyJwt rejects tampered signature` test** was flaky: tampered the LAST char of a
  base64url signature, but for a 32-byte HS256 sig (43 chars) the last char's 2 LSBs are
  padding bits the decoder discards. Fixed by tampering a middle char where all 6 bits are
  meaningful. Verified across 5 consecutive clean runs.

---

## Inventory of operator-facing surface

### Bounded contexts (8) — client screens shipping in beta

| Domain     | SAP analogue | Screens (route)                                                        |
| ---------- | ------------ | ---------------------------------------------------------------------- |
| `costing`  | CO           | Standard, Complex, PrintArea, Ink, MasterCylinder                      |
| `library`  | MM           | Material (CRUD), Rate (CRUD), Finance (CRUD), MfgStructure, RoutingOps |
| `planning` | PP           | Orders, NewOrder (form), WIPTracker, CapacityBoard                     |
| `sales`    | SD           | QuoteHistory + Trash + admin Delete                                    |
| `quality`  | QM           | SampleTracking + New + state transitions                               |
| `security` | SU           | Approvals inbox, PermissionGroups admin, Users admin                   |
| `basis`    | BC           | Dashboard, Settings (admin), AdminMetrics (sys), AuditLog (sys)        |
| `mes`      | MES          | IFSInventory, ConnectionMode                                           |

### Platform packages (9)

`auth` · `audit` · `cache` · `sync` · `i18n` · `ui-kit` · `http` · `storage` · `observability`

### Apps (3 deployment shells)

- **`apps/server`** — Express boot, cross-domain `/api/dashboard/metrics` + `/api/health` +
  `/api/metrics`, telemetry beacon endpoint
- **`apps/client`** — Vite + React 19 shell, hash router, AuthGate
- **`apps/desktop`** — Electron CLIENT/SERVER mode shell, bundle marker verification

### AI agent configuration

`.claude/` ships per the `3. PROJECTS/README.md` pattern: 9 slash commands · 10 specialised
agents · 13 mandatory rules · 5 skills · 4 reference checklists.

---

## Operational invariants preserved from v1.2

These are load-bearing — each was learned the hard way during v1.2 hardening sprints (1.5–1.7).

| #   | Invariant                                                             | Where enforced                                                                         |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Soft-delete filter on every read path                                 | All `*Store.js`; `countActionable filters deleted_at` regression test                  |
| 2   | Atomic JSON writes for `data/library/*`                               | `@platform/storage/atomicWriteJson`                                                    |
| 3   | Audit dual-write on every admin mutation                              | All routers call `audit.log()` after mutation                                          |
| 4   | TOTP fail-closed (missing key → reject)                               | `@platform/auth/totp.js`                                                               |
| 5   | Released quotes are immutable (DELETE refused; archive instead)       | `quoteStore.softDeleteQuote`                                                           |
| 6   | InProgress orders cannot be deleted (must Cancel first)               | `orderStore.softDeleteOrder`                                                           |
| 7   | Master Cylinder factory rows: toggle-only, never deletable            | `cylinderService.deleteCylinder + FACTORY_DEFAULT_ZS`                                  |
| 8   | Approval workflow authZ (assignee/admin only)                         | `approvalStore.transitionApproval`                                                     |
| 9   | `rejectReason` sanitised (HTML stripped, length capped, ANSI removed) | `@platform/http/sanitizeReason`                                                        |
| 10  | Optimistic locking via `version` + `If-Match` header                  | All transition routes                                                                  |
| 11  | Currency USD ↔ VND auto-sync at create time                           | `quoteStore.syncCurrencies`                                                            |
| 12  | Path-traversal closed on every `:filename` route                      | `@platform/storage/safePath`                                                           |
| 13  | Role check both client + server for admin UI                          | `useAuth().hasRole('admin')` + `requireRole('admin')` middleware                       |
| 14  | ETag short-circuit on cacheable GETs                                  | `@platform/cache/sendJsonWithEtag`                                                     |
| 15  | Bcrypt rounds ≥ 12 in production                                      | `@platform/auth/bcrypt.js`                                                             |
| 16  | HS256 JWT cookie HttpOnly + Secure + SameSite=Strict                  | `@platform/auth/jwt.js + sessionCookie`                                                |
| 17  | Login lockout 5 fails / 15 min, persisted across restart              | `@platform/auth/lockout.js` + SQLite-backed                                            |
| 18  | Cross-domain communication via `eventBus`, never direct imports       | `sales.quote.released`, `mes.connection_mode.updated`, `basis.backup_schedule.updated` |
| 19  | `Math.floor` for label fits per sheet (over-fit is wrong)             | `calcPrintArea.js` (v1.2 lesson 16)                                                    |
| 20  | Engines never round; display layer applies `.toFixed()` only          | `calcInk.js`, `calcStandard.js`, `calcComplex.js`                                      |

## Known gaps (NOT in this release)

These v1.2 surfaces are still un-ported and DEFERRED to v1.3.1+:

| Surface                                            | v1.2 LOC | Why deferred                                           |
| -------------------------------------------------- | -------- | ------------------------------------------------------ |
| `mes/hardware` (USB / RS232 config)                | ~426     | Desktop-bridge dependent (electron-store)              |
| `mes/machine-technical`                            | ~677     | Needs new schema + store + endpoints                   |
| `sales/quote-analysis`                             | ~603     | Carbon redesign; pricing breakdown chart               |
| `library/ImportWizard` primitive                   | ~500     | CSV preview/commit pipeline; needs server-side staging |
| `planning/{BOMExplosion,MaterialCheck,WorkOrders}` | ~830     | Needs WIP + work-orders APIs first                     |
| DDL admin CRUD                                     | small    | Mirror of Material/Rate/Finance pattern; low priority  |
| Connection mode setup wizard                       | small    | Desktop CLIENT first-run UX                            |
| Per-tab LangFlagToggle                             | small    | Top-bar global toggle covers the common case           |

For each of the above, the v1.2 implementation continues to ship in production. Port forward
follows the MIGRATION.md table per sprint.

## Migration from v1.2

v1.2 stays in production until v1.3.0 GA cuts a stable release with the deferred items above
ported. v1.3.0-beta.1 is suitable for **operator preview** on test installs. Operators
continue to use v1.2 installers in production.

To cut v1.3.0 GA:

1. Port the deferred items above (sprint-by-sprint).
2. Run the full v1.2 self-test suite against v1.3 builds.
3. Bundle-marker grep verification on each installer.
4. Smoke install on a clean userData dir.
5. Rename release tag from `v1.3.0-beta.N` → `v1.3.0`.

## Verification (this release)

| Check                       | Result                                                        |
| --------------------------- | ------------------------------------------------------------- | ------ |
| Server test suite           | **284 / 284 passing** (was 246 at alpha cut)                  |
| Vite client bundle          | **128 modules · 102 KB gzipped**                              |
| Cross-domain import scan    | 0 violations across 8 domains                                 |
| ESLint boundaries           | enforced (ERROR mode since 1.3.5)                             |
| jwt tamper test reliability | 5/5 consecutive clean runs                                    |
| Bundle marker               | `opsctl-desktop-v1.3-marker` (verified per build via `strings | grep`) |

## Breaking changes vs v1.2

None at the user level. Internal API surface is incompatible — any v1.2-targeting integration
must be re-pointed at v1.3 endpoints. URL paths follow `/api/<domain>/<resource>` per
api-conventions; v1.2's `/api/save-all` etc. do NOT exist in v1.3.

## Credits

Architecture: Thiep Dang + Claude Sonnet 4.6 (1M context).
v1.3.13 → 1.3.22 build-out: Claude Opus 4.7 (1M context).
Reviewed by: `code-reviewer` + `security-auditor` agents.

---

## Quick start (for v1.3 reviewers)

```bash
cd "Ops Control v1.3"
npm install
cp .env.example .env
# Generate auth secrets per docs/runbooks/dev-setup.md

npm run dev           # boots server + Vite
open http://localhost:5173
```

## Quick start (for desktop installer testers)

```bash
bash scripts/build/build-desktop.sh           # all 4 (mac arm64 + win x64) × (CLIENT + SERVER)
bash scripts/build/build-desktop.sh client mac # one variant only
```

Output: `apps/desktop/dist-electron/*.{dmg,exe}`. Each artefact is verified post-build via
`strings | grep opsctl-desktop-v1.3-marker`. macOS Win cross-build needs `wine` installed.
