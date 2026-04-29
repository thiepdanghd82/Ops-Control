# Ops Control v1.3.0-rc.5 — Release notes

**Build date:** 2026-04-29
**Build ID:** `v1.3.0-rc.5-20260429T165447Z`
**Target:** macOS Apple Silicon (M1 / M2 / M3 / M4 / M5) — arm64 only
**Status:** Release candidate — pending operator UAT before tagging `v1.3.0`

---

## Artefacts

| File | SHA-256 | Size |
|---|---|---|
| `OpsControl-CLIENT-v1.3.0-rc.5-mac-arm64.dmg` | `ec3b867004b1a472a013dfdfc8dcd639e1ee3d6f8f4eae9acb712b9f9349384c` | 170 MB |
| `OpsControl-SERVER-v1.3.0-rc.5-mac-arm64.dmg` | `58e3cbdce6d7c83cfb3aa3372a293458958355ea41d5ff69ae7737fc97f57c27` | 170 MB |

Verify with `shasum -a 256 -c checksums.txt`.

## Changes since rc.4

### Apple-Silicon-only mandate (operator request, 2026-04-29)
- `desktop/package.json` `mac.target.arch` reduced from `["x64", "arm64"]` to `["arm64"]` only.
- DMG matrix collapsed from 4 files to 2. Intel Macs are no longer a target — CCL Vietnam fleet is fully Apple Silicon.

### ADR-0013 enforce mode (router test gate)
- `.github/workflows/ci.yml` `router-test-coverage` job flipped from warn-mode to error-mode.
- Every domain router now MUST ship with a sibling `*.test.js` covering auth/role/happy/error paths. PRs that add a router without a sibling test will fail CI.
- The two debt routers closed in this RC: `server/domains/security/routes/audit.js` (8 tests) and `server/domains/basis/routes/backup.js` (7 tests).

### Audit router → factory pattern (closes ADR-0013 debt)
- `server/domains/security/routes/audit.js` now exports `createAuditRouter({auth, requireRole, tailAudit, auditRowCount})` with stub-driven contract tests pinning the falsy-fallback behaviour around `limit=0`.
- Default export pre-wires real deps so legacy callers (`server/index.js`) continue to work unchanged.

### DDL cluster URL cutover (ADR-0009 N6 → O1)
- `client/src/services/api.js` migrated 4 call sites from `/ddl/*` → `/library/ddl/*`:
  - `getDdlBackups`, `backupDdl`, `restoreDdl`, `exportDdlCsv`.
- Server keeps both URLs live during the 2-sprint waiting period per ADR-0009 dual-mount.

### platform/csv unit tests (O5)
- New `server/platform/csv/index.test.js` (10 tests) covering `rateRows` and `ddlToCsvRows`: empty input, null safety, header-order regression guard, `_custom_sections` exclusion, JSON.stringify of non-strings.

## Verification

The DMG was built with `OPS_BUILD_ID=v1.3.0-rc.5-20260429T165447Z` and the bundle marker is baked into the client chunk.

```bash
bash scripts/verify-bundle-marker.sh \
  dist/OpsControl-CLIENT-v1.3.0-rc.5-mac-arm64.dmg \
  v1.3.0-rc.5-20260429T165447Z
# → ✓ Bundle marker found: opsctl-v1.3-marker:v1.3.0-rc.5-20260429T165447Z:2026-04-29T16:54:48.705Z

bash scripts/verify-bundle-marker.sh \
  dist/OpsControl-SERVER-v1.3.0-rc.5-mac-arm64.dmg \
  v1.3.0-rc.5-20260429T165447Z
# → ✓ Bundle marker found: opsctl-v1.3-marker:v1.3.0-rc.5-20260429T165447Z:2026-04-29T16:54:48.705Z
```

Both binaries shipped from this exact build are tied to that marker — supply-chain swap during distribution would break the check.

## Outstanding (deferred to rc.6 / v1.3.0 final)

- Windows `.exe` installers — needs Windows VM or Wine.
- 3 client URL call sites still on legacy paths: `/admin/backup-schedule`, `/quotes` POST, `/save-quotation`. Pending UI cutover per ADR-0009.
- `server/routes/costApi.js` (~2,700 LOC) extraction roadmap — track in `docs/COSTAPI_EXTRACTION_ROADMAP.md`.
- Operator UAT sign-off before promoting to `v1.3.0`.

## Install

See `MIGRATION_GUIDE.md` §2 (server) and §3 (client). Pre-flight checks in §1 — DO take the data backup before replacing the v1.2 binary, even though data layout is unchanged.
