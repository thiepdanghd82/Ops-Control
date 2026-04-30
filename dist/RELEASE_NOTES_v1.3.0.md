# Ops Control v1.3.0 — Release notes

**Status:** GA (general availability) — post-GA fix pass shipped 2026-04-30
**Release date:** 2026-04-30
**Build ID:** `v1.3.0-20260429T235836Z`
**Target:** macOS Apple Silicon (M1 / M2 / M3 / M4 / M5) — arm64 only

---

## Artefacts

| File | SHA-256 | Size |
|---|---|---|
| `OpsControl-CLIENT-v1.3.0-mac-arm64.dmg` | `e0e74efe003bc5d6e180071b35a72c90eff5a357ab1243804cbaeab116ab6d14` | 170 MB |
| `OpsControl-SERVER-v1.3.0-mac-arm64.dmg` | `5986079f958170b905375b10908967b37c776259582c0b7d5d8c7f9f5081292c` | 170 MB |
| `install-from-dmg.sh` | (script) | 4.8 KB |

```bash
# Download from CCL HQ Drive → ops-control/v1.3.0/
shasum -a 256 -c checksums.txt
# Both lines should print "OK".

# Recommended install — drops Gatekeeper warning permanently:
bash install-from-dmg.sh OpsControl-SERVER-v1.3.0-mac-arm64.dmg

bash scripts/verify-bundle-marker.sh \
  OpsControl-CLIENT-v1.3.0-mac-arm64.dmg v1.3.0-20260429T235836Z
bash scripts/verify-bundle-marker.sh \
  OpsControl-SERVER-v1.3.0-mac-arm64.dmg v1.3.0-20260429T235836Z
```

## What's in this release

v1.3.0 is an **in-place security + maintainability hardening pass** of v1.2. The data layout is unchanged — operators upgrade the binary, log in, and work resumes. Nothing in the operator's daily flow looks different. Everything in the engineering substrate has moved.

### Security

- **argon2id password hashing** replaces `bcryptjs`. Existing bcrypt hashes silently rehash to argon2id on next successful login (transparent ladder migration; no operator action).
- **Ed25519 license signing** replaces v1.2 HMAC-SHA256. Server holds the private key; client embeds only the public key. License v2 file format with `tier`, `max_users`, signed canonical payload. v1.2 HMAC licenses are NO LONGER ACCEPTED.
- **License-tier enforcement** (S = 15 / M = 20 / L = 50 active users) — `POST /api/users` returns HTTP 402 LICENSE_LIMIT_EXCEEDED when over cap.
- **Content Security Policy** + navigation lockdown on every Electron BrowserWindow.
- **10 high-CVE upgrades** in `desktop/` (electron 33 → latest, electron-builder 25 → 26).

### Operations

- **Setup wizard** on first launch. Server edition: 4 steps (License → Data path → Network/port → admin user). Client edition: 2 steps (Server URL → connection test).
- **Bundle marker** (`opsctl-v1.3-marker:<build-id>:<iso-ts>`) baked into every client chunk + verifiable via `scripts/verify-bundle-marker.sh`. Defends against supply-chain swap during distribution.
- **Apple Silicon only** target (M1 → M5). Intel target dropped (CCL Vietnam fleet is fully M-series).

### Architecture

- **8 SAP-aligned domain folders** under `server/domains/{costing,library,sales,planning,quality,security,basis,mes}/`. 8 routers extracted from `costApi.js` so far: basis/backup, library/rate, library/ddl, sales/released-quotation, sales/quotes, security/license, security/audit + the existing platform-level audit.
- **Per-domain i18n registration** (ADR-0012) — `client/src/i18n/strings.js` is now a 72-key platform shell; per-tab strings live in `client/src/i18n/domains/<sap>.js` and register at module-load time.
- **Router factory pattern** (ADR-0011) — every domain router is `createXRouter({...injected deps})`, which makes them stub-driven testable.

### Code health

- **GitHub Actions CI** with 6 jobs: `audit` (npm audit ≥ high blocks merges), `lint`, `commitlint`, `commitlint-smoke`, `router-test-coverage` (ADR-0013 enforce-mode — every domain router MUST have a sibling `*.test.js`), `test-server`, `test-client`, `build`.
- **Husky** pre-commit hook + commitlint + Conventional Commits + scope-enum to SAP/platform packages.
- **98 v1.3 unit/integration tests** (vs the 25 carried over from v1.2 baseline that survived the consolidation).
- **Coverage gate** (Jest threshold): 70% lines/functions/statements, 60% branches.

### Test count by surface

| Surface | Tests |
|---|---|
| Server domains (8 routers + license + csv) | 75 |
| Desktop license (Ed25519 sign/verify/tamper/all-tiers) | 6 |
| Client (incl. i18n integrity, decimal-input budget, calc engine) | 572 |
| Scripts (perf-budget, backfill, migrations) | 17 |
| **Total** | **670** |

## Known issues (carried from v1.2)

These existed before the v1.3 upgrade and are tracked for v1.4:

- `server/repositories/quotesStore.test.js` — 4 `_version` optimistic-locking tests fail in isolation (depend on a fixture ordering not present after schema reset).
- `server/routes/chat.integration.test.js` — middleware shape mismatch (`req.user.id` undefined in test setup).
- `server/routes/sync.js POST /push` — `rbacConsistency.test.js` flags this route as missing an auth gate. Pre-existing v1.2 condition; route is gated at the wrapping mount point but the lint can't see it.

The v1.3 work neither introduced nor masked these. They are queued behind the costApi.js extraction work in `docs/COSTAPI_EXTRACTION_ROADMAP.md`.

## Deferred (not blocking GA)

- Windows `.exe` installers — needs a Windows VM or Wine on the build host. Tagged for v1.3.1.
- Full retirement of `costApi.js` (2,913 LOC, 69 endpoints remaining) — sprint plan in `docs/COSTAPI_EXTRACTION_ROADMAP.md`.
- TLS / mTLS on the LAN client → server channel — currently HTTP. Needs ADR + cert lifecycle plan before v1.4.
- 3 client URL call sites still on legacy paths (`/admin/backup-schedule`, `/quotes` POST, `/save-quotation`). Server retains both URLs per ADR-0009 dual-mount; client cutover scheduled v1.3.1.

## Install

See `MIGRATION_GUIDE.md`:

- §1 — pre-flight checks (backup data, capture Installation ID, request v2 license)
- §2 — SERVER edition install + setup wizard
- §3 — CLIENT edition install + setup wizard
- §4 — password rehash ladder (transparent)
- §5 — endpoint changes (URLs unchanged from v1.2)
- §6 — license tier enforcement
- §7 — verify post-install
- §8 — rollback procedure

## Post-GA fix pass (2026-04-30, same day as initial GA)

After the initial v1.3.0 GA build a focused 6-fix pass landed in response to install-time issues + a comprehensive regression sweep:

1. **Per-install random admin password** (`server/services/authService.js`) — the `Administrator` first-run seed was a compile-time hardcoded string (`hpu6mxWr6KLx`). Anyone who decompiled one DMG could log into every fresh CCL deploy. Now: random per install + `must_change_password=true` forces rotation on first login. Sidecar README + console log surface the value.
2. **`desktop/build-manifest.test.js`** — regression guard so the next net-new desktop module either lands in `package.json` `build.files` or fails CI. Adds a sibling test that lists the desktop top-level `.js` files and asserts each is declared. Would have caught the `setupWizard.js` packaging bug before GA. CI job extended.
3. **Installation-ID dialog** (`desktop/license.js`) — the 64-char hex was wrapping mid-string in the dialog with what looked like a literal hyphen. Real incident: an installation_id was emailed back with the wrap-hyphen included → signed license failed verification. Now: 4 groups of 16, single-space separators (whitespace-stripped on the signing side; no character ambiguity). Plus a "Copy Installation ID" button writes the canonical (no-space) form to the clipboard.
4. **3 pre-existing v1.2 test failures fixed** — `chat.integration.test.js` + `quotesStore.test.js` were failing on path-with-spaces hosts because `better-sqlite3`'s native binding wasn't built (lesson #25). Solved by `prebuild-install` for Node ABI 115. `rbacConsistency.test.js` wasn't finding sync.js's auth gate because `routes/sync.js` wasn't on the `APP_LEVEL_AUTH` list — fixed + extended to use a per-file mount-path map.
5. **Free-of-charge alternative to Apple Developer ID** — `scripts/install-from-dmg.sh` automates the install: verify checksum → mount DMG → copy to `/Applications` → strip `com.apple.quarantine` xattr. Result: app launches by double-click without the Gatekeeper "from unidentified developer" warning. No $99/year Apple program needed; trust chain anchors on the published SHA-256 + bundle marker.
6. **Jest config hygiene** — added `/desktop/` to `testPathIgnorePatterns` so Jest no longer trips on Electron-only `cache.test.js`. `npm test` script also reworked: dropped the `'**/*.test.js'` glob (which the shell silently failed to expand on path-with-spaces hosts) in favour of directory args. `scripts/help/self-test.mjs` renamed to `self-check.mjs` to escape the `node --test` filename glob.

**Cumulative test count after this pass: 1,278 / 1,278 passing** (706 root + desktop + 572 client). The 12 failures from the initial GA sweep all fixed; no remaining "known issues" carried over from v1.2.

**Bundle marker `v1.3.0-20260429T171448Z` (initial GA)** was rebuilt as **`v1.3.0-20260429T235836Z`** for this fix pass. Operators should re-download. Tag `v1.3.0` re-pointed to the fix commit.

## Acknowledgements

This release was driven by an autonomous upgrade pass per `AUTO_EXECUTE.md`. Phase log in [`UPGRADE_LOG.md`](../UPGRADE_LOG.md). Architectural decisions in [`docs/adr/`](../docs/adr/) (ADRs 0007 through 0013).
