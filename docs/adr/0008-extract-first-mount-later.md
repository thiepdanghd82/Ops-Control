# ADR-0008 — Extract-first, mount-later pattern for domain router migration

**Status:** Accepted (v1.3 G1, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona · Henry Đặng
**Supersedes:** none
**Superseded by:** none

---

## Context

We are gradually splitting `server/routes/costApi.js` (2891 LOC) into
per-SAP-domain routers under `server/domains/<sap>/routes/`. Two
approaches are possible for each cohesive group of endpoints:

**(A) Big-bang extract-and-mount:**

- Pull endpoints into a new file.
- Mount the new file under `/api/<domain>/<resource>`.
- Remove the old endpoints from `costApi.js`.
- Update the client UI in the same PR if any URL changed.

**(B) Extract first, mount later:**

- Pull endpoints into a new file with a factory pattern
  (`createXxxRouter({ ...injected deps })`).
- Add unit tests that drive the factory through stubbed deps.
- LEAVE the original endpoints in `costApi.js` running.
- The new router is dead code from the runtime's perspective until
  it is wired into `server/index.js`.

We've used pattern (B) twice now (G1 rate router, H1 ddl router).
This ADR captures why.

## Decision

**Use pattern (B) — extract first, mount later — for any domain router
extraction where ANY of the following is true:**

1. The router needs helper functions (e.g. `siteToCsvKey`,
   `rateRows`, `ddlToCsvRows`) that haven't been extracted to
   `platform/` yet.
2. The endpoint URL would change in the new mount (`/api/rate/*` →
   `/api/library/rate/*`) and the client UI hasn't been updated.
3. The new router shape needs operator validation that wasn't part
   of the autonomous mandate (e.g. response schema differs from
   legacy).

**Use pattern (A) — extract and mount immediately — only when:**

1. The new URL exactly matches the legacy URL (so no client change).
2. All deps already exist as standalone exports.
3. Removing the inline handler doesn't break any other consumer in
   `costApi.js` (e.g. shared closures over `DATA_DIR`).

The audit router (security/audit) and license router
(security/license) used pattern (A) because URL stayed the same and
deps were already exported. Backup router (basis/backup) used a
hybrid — new URL `/api/basis/backup/schedule` AND legacy
`/api/admin/backup-schedule` coexist.

## Consequences

### Positive

- **PR scope stays small.** Each extraction is one file + tests; no
  cascading client changes, no risk of "I extracted 4 routers and
  now save-quote is broken".
- **Tests run before mount.** The factory is unit-tested through
  stubs FIRST, so wiring it live later is just a "router is
  trustworthy, plug it in" step.
- **The pattern itself becomes the deliverable.** Future engineers
  can grep `git log` for `extract` commits and see the same shape
  every time, lowering the learning curve.
- **Helper extraction can lag.** We don't block ourselves on
  `siteToCsvKey → platform/csv` work just to get the rate router
  off the god-file.

### Negative

- **Dead code window.** The new router file lives in the repo without
  being mounted — a code reviewer who skims a file isn't sure if it's
  in production. Mitigation: mark with `// NOT MOUNTED YET — see
CONTRIBUTING.md §F1` at the top of each unmounted router file.
- **Tests drift.** If costApi.js changes the legacy endpoint
  behaviour, the new router's tests aren't enforcing parity. We
  rely on the legacy endpoint's existing tests to catch behaviour
  drift; a regression test framework that pins the response shape
  pre-extract would catch this earlier (deferred to v1.3.x).
- **Two surfaces during migration.** When we DO mount, the legacy
  AND new URLs both work briefly until UI migrates. Operators won't
  notice; integration tests need to know which one to hit (we
  document the current truth in `MIGRATION_GUIDE.md`).

### Reversal cost

Trivial. To reverse: delete the unmounted router file. The legacy
endpoints in `costApi.js` were never touched.

## Alternatives considered

### Tag-and-skip (mount immediately but disabled by feature flag)

Rejected. Adds runtime branching for no reason — the router file is
either ready or it isn't. A flag introduces a third state ("ready,
mounted, but disabled") that adds entropy.

### Branch-per-router

Rejected. The git topology mandate (`release/v1.3` per AUTO_EXECUTE.md)
means one branch holds all the architecture work. Per-router branches
fan out reviews and create merge order risk.

### Wait for full helper extraction first

Rejected. Helper extraction (e.g. `siteToCsvKey` → `platform/csv`) is
multi-sprint work blocked on its own ADR. Holding domain routers
hostage to platform refactor inverts the priority — domain ownership
clarity ships first because it's higher operator value.

## Mounting checklist (when ready to wire live)

For each unmounted router:

```
1. Confirm all helper deps exist as named exports somewhere
   (authService, atomicWrite, validate middleware, etc.).
2. Add the mount in server/index.js BEFORE costApiRouter so the
   explicit route wins:
     app.use('/api/<sap>/<resource>',  createXxxRouter(deps));
     app.use('/api/v1/<sap>/<resource>', createXxxRouter(deps));
3. If URL is identical to legacy:
     remove the inline handler from costApi.js (single PR).
   If URL differs:
     leave legacy in place; client UI migration is a separate PR.
4. Run boot smoke: curl the new URL + the legacy URL side-by-side,
   confirm same response shape.
5. Remove the "NOT MOUNTED YET" comment from the router file.
6. Update MIGRATION_GUIDE.md §5 with the routing table delta.
```

## References

- `server/domains/library/routes/rate.js` (G1) — first proof of pattern
- `server/domains/library/routes/ddl.js` (H1) — second proof
- `server/domains/security/routes/audit.js` (P3.1) — pattern (A) example
- `server/domains/security/routes/license.js` (P5.1) — pattern (A) example
- `CONTRIBUTING.md §2` — domain router factory template
- `MIGRATION_GUIDE.md §5` — endpoint path mapping
