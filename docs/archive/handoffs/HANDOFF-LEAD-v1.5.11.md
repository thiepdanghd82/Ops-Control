# HANDOFF — Mac DMG SERVER v1.5.11 → Lead

**Date built:** 2026-05-29
**Tag:** `v1.5.11` (commit `50c81a0`)
**Artifact:** `desktop/dist-electron/Ops Control SERVER 1.5.11-arm64.dmg`
**Size:** 210 MB
**SHA256:** `9116bcb05ee9c6ee253b6d82e568f14dab742eed7ed0dec329821b95190b22bf`

## What's in this release

| PR  | Commit    | Summary                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #92 | `9c98c96` | P0 client version banner — `<ClientUpdateIndicator>` polls `/api/version` every 5 min, shows red banner when client ≠ server. Audit emits `CLIENT_UPGRADE_NUDGE_SHOWN` once per session + `CLIENT_VERSION_MATCH_AFTER_UPGRADE` on boot after operator installs. No download button at P0 — operator contacts Lead.                                                                                                       |
| #93 | `6383635` | `prettier --write .` repo-wide format-only sweep. No behavior change.                                                                                                                                                                                                                                                                                                                                                    |
| #94 | `50c81a0` | Version bump `1.5.10 → 1.5.11` across root + client + desktop + lock. About card wiring: Settings → About + Diagnostics + Login page now read `__APP_VERSION__` Vite global instead of hardcoded `'1.5.10'`. Closes the v1.5.10 stale-string trap found during DMG smoke test.                                                                                                                                           |
| #95 | `400b35c` | **2 operator bug fixes:** (a) Tool Cost / Setup LM / packing inputs in Std + Cpx now accept VN-locale decimals (`12,5` and `12.5` both → `12.5`) via `parseLocaleNumber`; was `parseFloat("12,5")` truncating to 12. (b) Standard → Summarize crash `(t.code \|\| t.desc \|\| "mat").replace is not a function` fixed via `String()` guard in `ProcessFlowChart` (root cause: `m.code` was numeric from library import). |

## Smoke verification (done locally)

- ✅ Mac DMG built clean via `node scripts/build-mac-installers.mjs server` (electron-builder 26.8.1, electron 41.3.0, ad-hoc signed, npmRebuild skipped per Lesson 25)
- ✅ better-sqlite3 binary parity verified per Lesson 28: SHA256 `e8c5e5e4b5b2b8fec4eeaf3ca18df78d40271bde738ec57faddb19bcedda5eb1` matches at both `app/node_modules/better-sqlite3/.../better_sqlite3.node` AND `app.asar.unpacked/node_modules/better-sqlite3/.../better_sqlite3.node`. No NMV mismatch trap.
- ✅ Native overlay preflight clean: `better-sqlite3`, `node-hid`, `@serialport/bindings-cpp` all have matching `extraResources` entries.

## Hardware test ask

Please mount + install on the SPARE Mac (NOT the prod box yet):

1. Mount `Ops Control SERVER 1.5.11-arm64.dmg`, drag to `/Applications` (replace existing 1.5.10 if present)
2. First launch — Gatekeeper "Open Anyway" if prompted
3. Login as sys or admin
4. **Verify About card:** Settings → About → must show `v1.5.11` (NOT 1.5.10 — this is the regression we just closed)
5. **Verify VN-locale decimals:** Std → New Quote → Processes tab → Tool Cost field → type `12,5` → confirm displays `12.5` (was truncating to `12`). Re-test on Complex → SubProductRow → Setup LM column.
6. **Verify summarize works:** create a Std quote with at least 1 material row → Summarize tab → should render without console error `(t.code...).replace is not a function`.
7. **Verify P0 banner:** stop server / start old client (or wait for banner UX testing — internal logic-only verify is fine for now since prod is single-server).

## Known pre-existing CI red (not blocking)

- Lint: 5 pre-existing errors on `main` baseline (unrelated to #94 changes). Same pattern as 8+ prior PRs admin-merged through D-15 sprint.
- Server test: `per-entry ETIMEDOUT is isolated` flake (pre-existing per CLAUDE.md S-EXPORT-MVP-2 ship note).
- Decision: admin-merged #94 per option **A** — both fails are baseline noise, not regressions. PR #94 itself introduces 0 new lint errors, 0 new vulns, 0 new test fails. Filed cleanup ticket for post-go-live.

## Win EXE CLIENT

Win EXE build not triggered yet — the repo CI only has a `CI` workflow, no separate `Build installers` workflow on tag push. Win EXE will need either:

- Manual run of `npm run desktop:build:win` from a Windows host, OR
- New GitHub Actions workflow targeting `windows-latest`

Pending operator/sysadmin decision on which path for D-7 Win field test.

## Open follow-ups

- Licenses registry PR (`docs/operations/licenses/`) — operator license for mpham Win box currently on local stash, will resume after DMG handoff confirms.
- Pre-existing lint + flaky test cleanup PR (post-go-live).

— Generated 2026-05-29 from `main` @ `50c81a0`
