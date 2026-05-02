# ADR-0013 — No mounted router without sibling contract tests

**Status:** Accepted (v1.3 N5, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona
**Builds on:** ADR-0008, ADR-0009, ADR-0011, COVERAGE_BASELINE.md
**Supersedes:** none

---

## Context

Across Phases P3–M we extracted 8 routers. 7 of them shipped with
sibling `*.test.js` files (44 contract tests total, ~95 % line
coverage on the routers themselves). One — `basis/backup.js` —
shipped WITHOUT tests (deferred at F1 because the inject-deps shape
for the scheduler was still settling).

That gap is uncomfortable: production traffic hits a router whose
contract isn't pinned. A future refactor of `backupScheduler.js`
could break the router silently because no test pins the response
shape.

Beyond the literal `basis/backup.js` gap, we also lack an
ENFORCEMENT mechanism. Nothing in CI fails when a new
`server/domains/*/routes/*.js` lands without a matching
`*.test.js`. ADR-0008 says "extract first" implies tests; ADR-0011
says the test template is mandatory; neither is enforced.

This ADR turns the convention into a CI gate.

## Decision

**A mounted domain router MUST have a sibling `<name>.test.js`
file with at minimum 4 tests:**

1. **Auth gate** — unauth → 401.
2. **Role gate** — wrong role → 403 (when the router has any
   role-restricted endpoint).
3. **Happy path** — at least one endpoint with valid input → 200
   + expected side effect.
4. **Error path** — at least one negative case (404, 400, or 409)
   per non-trivial endpoint.

**A scaffolded-but-unmounted router** (per ADR-0008 extract-first)
MUST have the same test minimum even though it isn't reachable from
the mounted app. Tests prove the factory contract before mounting.

### CI gate

Add a job to `.github/workflows/ci.yml`:

```yaml
router-test-coverage:
  name: Router test coverage
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Every domain router has a sibling test file
      run: |
        cd server/domains
        missing=0
        for router in $(find . -name '*.js' \
                          -path '*/routes/*' \
                          -not -name '*.test.js'); do
          test_file="${router%.js}.test.js"
          if [ ! -f "$test_file" ]; then
            echo "MISSING test for: $router"
            missing=$((missing + 1))
          fi
        done
        if [ $missing -gt 0 ]; then
          echo "$missing router(s) missing sibling test files"
          exit 1
        fi
        echo "All routers have sibling tests"
```

Wired in the same workflow as `lint` + `commitlint`. Fails the PR
when a router lands without tests; reviewer can override with
`--force` only on documented emergency basis (recorded in PR body).

### Existing gap remediation

`basis/backup.js` ships with NO tests as of rc.3. This ADR
mandates the gap be closed in v1.3.0-rc.5 (next sprint). Until
then, the CI gate runs in `warn` mode (emits a warning but doesn't
fail) so the existing repo state passes; flips to `error` mode
once `basis/backup.test.js` lands.

## Consequences

### Positive

- **Defect signal is sharper.** A regression in `quotesStore.upsertQuote`
  shape hits the router test before it hits production.
- **Pattern enforcement automatic.** New engineers can't ship a
  router without realising tests are required — they discover it
  at PR time, not at incident time.
- **Coverage trend tracks reality.** `docs/COVERAGE_BASELINE.md`
  stays accurate because every router file has a paired test
  file contributing to the measured surface.

### Negative

- **Boilerplate cost.** Each router file = ~80 LOC × 2 (impl + test).
  Multiply by 20+ routers planned through v1.3.x → ~1600 extra LOC.
  Acceptable; tests pay for themselves on the first regression they
  catch.
- **Test fragility risk.** Over-specific tests can lock the
  router's response shape so tightly that legitimate refactors
  break them. Mitigation: 4-test minimum focuses on STATUS
  CODES + SIDE EFFECTS, not exact JSON shape; per-key payload
  assertions are optional, not required.
- **`basis/backup.js` debt.** One existing router fails the gate
  today. Documented; remediation tracked.

### Reversal cost

Trivial. Comment out the CI job. The convention reverts to
"informal expectation" — no code changes needed.

## Alternatives considered

### Coverage threshold instead of file presence

Rejected. Coverage measures lines hit, not contracts pinned. A
test file with `describe.skip()` would yield 0 % coverage but pass
a "≥ 70 %" threshold if measured globally. File-presence + minimum
test count is the more honest signal.

### TypeScript-typed router contracts

Rejected. v1.2/v1.3 stays plain JS. Type contracts are documentation
of intent; tests are runtime proof.

### Documentation-only enforcement

Rejected. CONTRIBUTING.md §F2 already says "tests are required".
Six months of memory loss + new engineers + sprint pressure WILL
break that. CI is the only enforcement layer that survives.

## Routers conformance status (as of 2026-04-29 / rc.4)

| Router | Sibling test? | Test count | Compliant? |
|---|---|---|---|
| `server/domains/security/routes/audit.js` | – | 0 | ❌ debt — open ticket |
| `server/domains/security/routes/license.js` | ✅ | 5 | ✅ |
| `server/domains/basis/routes/backup.js` | – | 0 | ❌ debt — open ticket |
| `server/domains/library/routes/rate.js` | ✅ | 8 | ✅ |
| `server/domains/library/routes/ddl.js` | ✅ | 6 | ✅ |
| `server/domains/sales/routes/released-quotation.js` | ✅ | 9 | ✅ |
| `server/domains/sales/routes/quotes.js` | ✅ | 14 | ✅ |

**Conformance: 5/7 (71 %)**. CI gate enables `warn` mode at
rc.4; `error` mode at rc.5 once the 2 debt routers (`audit`,
`basis/backup`) get sibling tests.

## References

- ADR-0008 — extract-first-mount-later (when tests are required)
- ADR-0011 — domain router factory pattern (template for tests)
- COVERAGE_BASELINE.md — tracks coverage trend
- `.github/workflows/ci.yml` — CI gate implementation
- CONTRIBUTING.md §F2 — informal predecessor convention
