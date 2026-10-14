# costApi.js extraction roadmap (v1.3 → v1.4)

**Status:** living document — update as endpoints migrate.
**Source of truth:** `server/routes/costApi.js` (2,913 LOC, 69 endpoints as of rc.5).
**Goal:** retire `costApi.js` entirely once every endpoint has a domain-router twin and the legacy URLs satisfy ADR-0009 retirement criteria.

---

## Why this exists

Through v1.3 we extracted 8 routers under `server/domains/<sap>/` (basis/backup, library/rate, library/ddl, sales/released-quotation, sales/quotes, security/license, security/audit). The other 61 endpoints still live in `costApi.js`. This file groups them by SAP domain so the next sprint can pull a coherent slice instead of cherry-picking by file location.

Per **ADR-0008** (extract-first-mount-later) and **ADR-0009** (dual-mount during migration), every extraction follows three steps:

1. **Scaffold** — copy handler into `server/domains/<sap>/routes/<feature>.js` as a factory, write sibling `*.test.js` (ADR-0013).
2. **Mount alongside** — add new canonical URL to `server/index.js` BEFORE `costApiRouter`. Legacy URL stays live.
3. **Cut over client** — flip `client/src/services/api.js` call sites to the canonical URL, then wait the 2-sprint cool-down before deleting from `costApi.js`.

## Endpoint inventory by target SAP domain

### security/ — auth, TOTP, sessions, audit (23 endpoints)

| Line | Verb   | Path                          | Notes                                                                            |
| ---- | ------ | ----------------------------- | -------------------------------------------------------------------------------- |
| 483  | POST   | `/auth/login`                 | bcrypt → argon2id ladder lives here; password rehash is non-trivial to lift      |
| 617  | POST   | `/auth/logout`                | session revoke                                                                   |
| 641  | GET    | `/auth/me`                    | session probe                                                                    |
| 672  | GET    | `/auth/pwd-age/:username`     | age-of-password check                                                            |
| 691  | GET    | `/auth/users`                 | list users + license seat count                                                  |
| 717  | POST   | `/auth/users`                 | already gated by `licenseService.requireSeatAvailable` middleware in v1.3        |
| 766  | PUT    | `/auth/users/:id`             | profile + role edit                                                              |
| 883  | DELETE | `/auth/users/:id`             | soft-delete                                                                      |
| 901  | POST   | `/auth/change-pwd`            | self-service                                                                     |
| 937  | POST   | `/auth/update-profile`        | name/email                                                                       |
| 960  | POST   | `/auth/users/:id/reset-pwd`   | admin-triggered                                                                  |
| 994  | POST   | `/auth/users/:id/temp-pwd`    | provisioning card                                                                |
| 1045 | GET    | `/auth/audit-log`             | distinct from `/api/audit` (already extracted) — this is the _legacy_ admin view |
| 1065 | GET    | `/auth/sessions`              | active sessions list                                                             |
| 1076 | POST   | `/auth/sessions/revoke`       | force-logout                                                                     |
| 1091 | POST   | `/auth/verify-pwd`            | re-auth gate                                                                     |
| 1107 | POST   | `/auth/migrate-users`         | one-shot migration tool — could move to `scripts/`                               |
| 1130 | GET    | `/totp/secret/:username`      | provisioning                                                                     |
| 1143 | POST   | `/totp/secret`                | enroll                                                                           |
| 1168 | POST   | `/totp/verify`                | login second factor                                                              |
| 1207 | POST   | `/totp/enroll`                | first-time                                                                       |
| 1245 | DELETE | `/totp/secret/:username`      | disable                                                                          |
| 2673 | POST   | `/auth/users/:id/session-ttl` | per-user remember-me                                                             |

**Recommended grouping:**

- `server/domains/security/routes/auth.js` — lines 483–1107 minus migrate-users
- `server/domains/security/routes/totp.js` — lines 1130–1245
- `server/domains/security/routes/sessions.js` — lines 1065 + 1076 + 2673

### basis/ — health, backup, ops infra (17 endpoints)

| Line | Verb | Path                             | Notes                                                       |
| ---- | ---- | -------------------------------- | ----------------------------------------------------------- |
| 1268 | GET  | `/ping`                          | liveness — already split in `server/index.js` /health probe |
| 1305 | GET  | `/users/status`                  | online roster                                               |
| 1312 | POST | `/heartbeat`                     | client keep-alive                                           |
| 2235 | GET  | `/admin/backup-schedule`         | **dual-mounted** — canonical at `/basis/backup/schedule` ✅ |
| 2246 | PUT  | `/admin/backup-schedule`         | **dual-mounted** ✅                                         |
| 2264 | POST | `/admin/backup-schedule/run-now` | **dual-mounted** at `/basis/backup/run-now` ✅              |
| 2406 | GET  | `/backup/list`                   | data backup file listing                                    |
| 2427 | GET  | `/backup/code-list`              | code-snapshot listing                                       |
| 2457 | GET  | `/backup/download/:name`         | data download                                               |
| 2470 | GET  | `/backup/code-download/:name`    | code download                                               |
| 2474 | POST | `/backup/data`                   | manual data backup trigger                                  |
| 2499 | POST | `/backup/code-server`            | snapshot server tree                                        |
| 2537 | GET  | `/backup/code`                   | code-backup status                                          |
| 2541 | POST | `/backup/restore`                | restore from data backup                                    |
| 2590 | POST | `/backup/upload`                 | accept uploaded backup file                                 |
| 2632 | POST | `/backup/delete`                 | remove a backup                                             |
| 2877 | POST | `/backup/code-restore`           | restore from code snapshot                                  |

**Recommended grouping:**

- `server/domains/basis/routes/health.js` — `/ping`, `/users/status`, `/heartbeat`
- `server/domains/basis/routes/backup-files.js` — all `/backup/*` (separate from existing `backup.js` which only handles the _schedule_)

### library/ — rate, DDL, master cylinders, layouts, lib (19 endpoints)

| Line | Verb   | Path                         | Status                                            |
| ---- | ------ | ---------------------------- | ------------------------------------------------- |
| 1865 | GET    | `/layouts`                   | listing                                           |
| 1881 | GET    | `/layout/:filename`          | path-traversal-guarded fetch                      |
| 1915 | POST   | `/save-layout`               | upsert                                            |
| 1950 | DELETE | `/layout/:filename`          | remove                                            |
| 1976 | GET    | `/rate/backups`              | **dual-mounted** at `/library/rate/backups` ✅ N6 |
| 1995 | POST   | `/rate/backup`               | **dual-mounted** ✅ N6                            |
| 2010 | POST   | `/rate/restore`              | **dual-mounted** ✅ N6                            |
| 2024 | POST   | `/rate/export-csv`           | **dual-mounted** ✅ N6                            |
| 2045 | GET    | `/ddl/backups`               | **dual-mounted** at `/library/ddl/backups` ✅ O1  |
| 2060 | POST   | `/ddl/backup`                | **dual-mounted** ✅ O1                            |
| 2074 | POST   | `/ddl/restore`               | **dual-mounted** ✅ O1                            |
| 2088 | POST   | `/ddl/export-csv`            | **dual-mounted** ✅ O1                            |
| 2107 | POST   | `/sync-csv`                  | rate sync from file                               |
| 2160 | POST   | `/ddl/sync-csv`              | DDL sync from file                                |
| 2328 | GET    | `/admin/master-cylinders`    | listing                                           |
| 2334 | PUT    | `/admin/master-cylinders/:z` | update one                                        |
| 2356 | POST   | `/admin/master-cylinders`    | create                                            |
| 2385 | DELETE | `/admin/master-cylinders/:z` | remove                                            |
| 2655 | GET    | `/lib/*`                     | catch-all readonly library fetch                  |
| 2705 | POST   | `/import-xlsm`               | bulk import via xlsx                              |

**Recommended grouping:**

- `server/domains/library/routes/layouts.js` — `/layouts`, `/layout/*`, `/save-layout`
- `server/domains/library/routes/master-cylinders.js` — `/admin/master-cylinders/*`
- `server/domains/library/routes/import.js` — `/import-xlsm`, `/sync-csv`, `/ddl/sync-csv`
- `server/domains/library/routes/lib-fetch.js` — `/lib/*` (read-only)

### costing/ — quote lifecycle (6 endpoints)

| Line | Verb   | Path                  | Notes                                                              |
| ---- | ------ | --------------------- | ------------------------------------------------------------------ |
| 1320 | GET    | `/load-all`           | full library + quote bundle for app cold-start — heaviest endpoint |
| 1417 | POST   | `/save-all`           | persistent quote write — `requireBodyTabAccess` permission gate    |
| 1686 | POST   | `/quotes`             | create new quote (Standard/Complex)                                |
| 1732 | DELETE | `/quotes/:id`         | soft-delete (or `?purge=1` sys-only hard delete)                   |
| 1792 | POST   | `/quotes/:id/restore` | undo soft-delete                                                   |
| 1825 | PATCH  | `/quotes/:id`         | partial update (status, approver, etc.)                            |

**Recommended grouping:**

- `server/domains/costing/routes/quotes.js` — `/quotes/*` lifecycle
- `server/domains/costing/routes/save-all.js` — `/load-all` + `/save-all` (paired contract)

`POST /quotes` is the trickiest because the existing `server/domains/sales/routes/quotes.js` already exists; that one handles `/sales/quotes` (released quotation publishing). They are NOT the same surface — costing/quotes is the working draft, sales/quotes is the published artefact. Don't merge them.

### sales/ — released quotations (3 endpoints)

| Line | Verb | Path                        | Notes                                                                              |
| ---- | ---- | --------------------------- | ---------------------------------------------------------------------------------- |
| 2180 | GET  | `/released-quotations`      | listing — already partly extracted to `domains/sales/routes/released-quotation.js` |
| 2196 | GET  | `/released-quotation/:name` | single fetch — same                                                                |
| 2205 | POST | `/save-quotation`           | publish new version                                                                |

**Recommended grouping:**

- Merge into existing `server/domains/sales/routes/released-quotation.js` — these legacy URLs need to be cut over per ADR-0009 (still pending in `MIGRATION_GUIDE.md` §8.1).

## Suggested sprint cadence

Each row is one sprint, ~1 week of touches. Order chosen to (a) close existing dual-mounts first, (b) extract the heaviest surface (security) once, (c) defer `/load-all` + `/save-all` to last because they touch every Library file and any regression cascades.

| Sprint | Group                                                                        | LOC ~ | Risk   | Notes                                                                                    |
| ------ | ---------------------------------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------- |
| P1     | sales — finish `/save-quotation` extraction + cut over client                | ~120  | low    | already 2/3 done in v1.3                                                                 |
| P2     | basis — `/backup/*` files + `/admin/master-cylinders` (small library detour) | ~600  | low    | mostly file IO, easy stub-driven tests                                                   |
| P3     | library — layouts + lib-fetch + import-xlsm                                  | ~500  | medium | `/import-xlsm` parses xlsx → schema-validate paths matter                                |
| P4     | security — totp + sessions sub-routers (auth left for last)                  | ~300  | medium | OTP flows are well-tested; isolate first                                                 |
| P5     | security — auth (login/logout/users/change-pwd/reset-pwd/temp-pwd)           | ~700  | high   | password ladder + license-seat enforcement; rehearse on a copy                           |
| P6     | costing — quote lifecycle (`/quotes/*`)                                      | ~250  | medium | optimistic locking + soft-delete, contract tests already exist via `quotesStore.test.js` |
| P7     | costing — `/load-all` + `/save-all` (last, hardest)                          | ~600  | high   | touches every Library file + permission-group gate; needs a UAT before retiring legacy   |

Sum ≈ 3,070 LOC of which costApi.js will trim to **~0** if discipline holds. The 60-LOC residual is the express router instantiation + helper imports that can be deleted along with the file once the last endpoint exits.

## Acceptance for "costApi.js retired" (per ADR-0009)

The file deletes from disk only when ALL of:

1. Every endpoint listed above has a domain-router twin live in production.
2. `client/src/services/api.js` references zero legacy URLs.
3. Two consecutive sprints pass post-cutover with no defect tickets on the new URL surface.
4. `server/index.js` no longer imports `costApiRouter`.

Until then, `server/routes/costApi.js` stays — including the dual-mounts already done in v1.3.

## Tracking table

Each PR that closes a row should update this list in-place (move endpoints from "remaining" to "extracted") and update `MIGRATION_GUIDE.md §8.1` with cutover status.

| Endpoint                              | Extracted in | Cut over             | Legacy retired                |
| ------------------------------------- | ------------ | -------------------- | ----------------------------- |
| `/api/audit`                          | v1.3 N5      | n/a (no path change) | yes (replaced inline)         |
| `/library/rate/*`                     | v1.3 N4      | v1.3 N6              | pending — 2 sprints from rc.4 |
| `/library/ddl/*`                      | v1.3 N4      | v1.3 O1              | pending — 2 sprints from rc.5 |
| `/basis/backup/schedule` + `/run-now` | v1.3 K       | pending              | pending                       |
| `/sales/quotes`                       | v1.3 M       | pending              | pending                       |
| `/sales/quotations`                   | v1.3 J/K     | pending              | pending                       |
| `/security/license/*`                 | v1.3 J       | n/a (new)            | n/a                           |
| (everything else above)               | v1.4 P1–P7   | tbd                  | tbd                           |
