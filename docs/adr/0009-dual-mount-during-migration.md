# ADR-0009 — Dual-mounting (legacy + new path) during domain migration

**Status:** Accepted (v1.3 J1, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona
**Context:** Follows ADR-0008 (extract-first-mount-later)
**Supersedes:** none
**Superseded by:** none

---

## Context

When the `library/rate` router went from "extracted but not mounted"
(G1) to "mounted live" (J1), we faced a binary choice:

**(A) Cut over:** Mount the new `/api/library/rate/*` router AND
remove the legacy `/api/rate/*` handler from `costApi.js` in the same
commit. Client UI gets a 404 on the old URL until UI migrates.

**(B) Dual-mount:** Mount the new router AND keep the legacy
handler alive. Both `/api/rate/backups` and `/api/library/rate/backups`
respond identically. UI migrates at its own pace.

We went with **(B)**. This ADR captures why.

## Decision

**Use dual-mount for every domain extraction where ANY of the following
is true:**

1. The new URL differs from the legacy URL (path renamed during
   extraction).
2. The legacy URL has shipping client UI that hits it.
3. The extraction is part of an ongoing in-place migration (not a
   release boundary).

**Cut-over directly is acceptable when:**

1. The new URL is byte-identical to the legacy URL (no UI change
   needed) — `Express` order ensures the new mount wins.
2. No client UI hits the URL (purely internal / scripts only).
3. The release notes explicitly call out a breaking URL change.

## Consequences

### Positive

- **UI migrates on its own clock.** The client team can replace
  `fetch('/api/rate/backups')` with `fetch('/api/library/rate/backups')`
  in their next sprint without any server change. No coordinated
  big-bang.
- **Rollback is just a route comment.** If the new router has a bug,
  comment out the new mount in `server/index.js`; the legacy keeps
  serving. No data loss, no rollback DB migration.
- **A/B comparison is trivial.** Dev can `curl` both URLs side-by-side
  and confirm they return the same JSON shape — proves parity before
  cut-over.
- **Pattern consistency.** ADR-0008 says "extract first"; ADR-0009
  says "dual-mount when activating". Same playbook for every
  extraction, low cognitive load.

### Negative

- **Two surfaces in production.** Some operators may have hard-coded
  the legacy URL in scripts; both keep working but the existence of
  two URLs is itself confusing. Mitigation: documentation in
  `MIGRATION_GUIDE.md §5` lists the canonical URL per resource (the
  NEW one, even during dual-mount).
- **Test surface doubles.** Each endpoint needs proof that BOTH URLs
  work, until the legacy is retired. We currently rely on the
  factory's stub-driven tests for the new URL and the legacy
  endpoint's existing tests in `costApi*.test.js` for the old —
  no integration test pins the parity. Acceptable for the migration
  window; v1.3.x backlog item: parity smoke test before legacy retirement.
- **Code duplication during the window.** `rateRows` exists in both
  `platform/csv/index.js` (NEW, owned) and inline in `costApi.js`
  (LEGACY, retained). Documented at top of `platform/csv/index.js`
  to prevent drift.

### Reversal cost

Trivial. Comment out the new mount in `server/index.js`. Legacy keeps
working unchanged. Re-enable when the new router is fixed.

## Retirement criteria — when does the legacy URL go away?

The legacy URL retires when ALL of:

1. Client UI no longer hits the legacy URL (grep `client/src/**` for
   the literal path; should return zero matches).
2. No external scripts / external integrations are documented to
   hit it (check `Use guide/`, `INSTALL.command`, customer-facing
   docs).
3. Two consecutive sprints pass without a defect filed against the
   new URL — proves the new path is stable.
4. Legacy endpoint behaviour is fully covered by the new router's
   contract tests.

When all four hold, retire in a single PR:
- Remove the inline handler from `costApi.js`.
- Note the retirement in `CHANGELOG.md` under "BREAKING (legacy URL
  retired)".
- Update `MIGRATION_GUIDE.md §5` to drop the dual-mount row.

## Alternatives considered

### Hard cut-over with client UI in the same PR

Rejected. Coordinated UI + server changes in one PR are slow to
review (different reviewers, different test scopes). The dual-mount
pattern unblocks server engineering immediately and lets the UI
team ship at their own cadence.

### Feature flag (mount only when env var set)

Rejected. Adds runtime branching for no reason — once the router
is ready it's always ready; we don't need an off-switch in
production. Rollback by route comment is just as fast as flipping
a flag.

### Permanent dual-mount (never retire legacy)

Rejected. Two URLs forever doubles maintenance for every endpoint:
caching headers, audit log entries, rate limit buckets, security
review surface. Retirement is a value, not a cost.

## Currently dual-mounted endpoints (as of 2026-04-29)

| Legacy path | New canonical path | Retire when |
|---|---|---|
| `GET /api/audit` (security) | n/a — same path, identity mount | already canonical |
| `GET /api/license/status` (security) | n/a — never had legacy at this path | already canonical |
| `GET /api/admin/backup-schedule` | `GET /api/basis/backup/schedule` | UI updates the path |
| `GET /api/rate/backups` | `GET /api/library/rate/backups` | UI updates the path |
| `POST /api/rate/backup` | `POST /api/library/rate/backups` | UI updates the path |
| `POST /api/rate/restore` | `POST /api/library/rate/restore` | UI updates the path |
| `POST /api/rate/export-csv` | `POST /api/library/rate/export-csv` | UI updates the path |
| `GET /api/ddl/backups` | `GET /api/library/ddl/backups` | UI updates the path |
| `POST /api/ddl/backup` | `POST /api/library/ddl/backups` | UI updates the path |
| `POST /api/ddl/restore` | `POST /api/library/ddl/restore` | UI updates the path |
| `POST /api/ddl/export-csv` | `POST /api/library/ddl/export-csv` | UI updates the path |
| `GET /api/released-quotations` | `GET /api/sales/quotations` | UI updates the path |
| `GET /api/released-quotation/:name` | `GET /api/sales/quotations/:name` | UI updates the path |
| `POST /api/save-quotation` | `POST /api/sales/quotations` | UI updates the path |
| `POST /api/quotes` | `POST /api/sales/quotes` | UI updates the path |
| `PATCH /api/quotes/:id` | `PATCH /api/sales/quotes/:id` | UI updates the path |
| `DELETE /api/quotes/:id` | `DELETE /api/sales/quotes/:id` | UI updates the path |
| `POST /api/quotes/:id/restore` | `POST /api/sales/quotes/:id/restore` | UI updates the path |

Update this table whenever a new dual-mount lands.

## References

- ADR-0008 — extract-first-mount-later (the prior step)
- `server/index.js` — mount points
- `server/routes/costApi.js` — legacy handlers retained
- `MIGRATION_GUIDE.md §5` — operator-facing path table
- `CHANGELOG.md` — release notes that flip retirement
