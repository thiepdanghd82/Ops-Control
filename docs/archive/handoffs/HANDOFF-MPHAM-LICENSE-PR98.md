# Handoff — mpham Win box license registry merged

**PR:** [#98](https://github.com/thiepdanghd82/Ops-Control/pull/98) — `docs(security): operator licenses registry + mint workflow`

**Branch:** `docs/operator-licenses-registry-mpham` (commit `998ae7c`)

**Date:** 2026-05-29 16:50 ICT

## What's in the PR

Docs-only. 3 files changed, 168 lines added, 0 deleted.

- `docs/operations/licenses/README.md` (137 lines) — workflow doc
- `docs/operations/licenses/2026-05-29-win-mpham.json` (18 lines) — registry entry
- `CHANGELOG.md` — `[Unreleased]` entry under `### Added`

## Pre-merge verification (already done by agent)

- ✅ License JSON parses (`node -e "JSON.parse(...)"`)
- ✅ Schema matches `scripts/license/generate-license.mjs` output format
- ✅ Ed25519 signature field present (64-byte base64, 88 chars)
- ✅ All existing license tests still pass on main (unchanged baseline)
- ✅ PR mergeable, 0 conflicts
- ✅ 8 CI checks running (expected: lint / format / tests / vuln / runtime-deps / commit-msg / router-siblings / build-artifacts)

## Post-merge verification (Lead)

1. **Pull main** on SERVER box (when convenient — no urgency, this is doc-only).

   ```bash
   git pull origin main
   ```

2. **Verify mpham license entry is browsable** from registry README:

   ```bash
   open docs/operations/licenses/README.md   # Mac
   # OR
   start docs\operations\licenses\README.md   # Win
   ```

   The "Registry — provisioned operators" table at line 77 should show mpham row.

3. **Verify license file integrity** (optional, sanity check):

   ```bash
   node -e "const lic = JSON.parse(require('fs').readFileSync('docs/operations/licenses/2026-05-29-win-mpham.json','utf8')); console.log('Customer:', lic.customer); console.log('Tier:', lic.tier); console.log('Expires:', lic.expires_at); console.log('Installation ID prefix:', lic.installation_id.slice(0,8));"
   ```

   Expected output: Yen Phong / M / 2027-06-09 / `d550d6b9`

4. **Verify mpham can still log in** from his Win box (sanity — this license was already deployed live on 2026-05-29 during Win operator install support session, so login should already be working). No action needed if mpham is operational.

5. **For future operators**: follow the workflow in [README.md](docs/operations/licenses/README.md#mint-a-license-for-a-new-operator) — single command via `scripts/license/generate-license.mjs` + append row to the registry table.

## Rollback (if needed)

License files in this directory are **reference artifacts**, not active runtime data. The actual license file on mpham's machine lives at `%APPDATA%\ops-control-desktop\license.json` and is independent of this repo.

- **Revert PR** = remove the registry record, does NOT affect mpham's working license
- **No service restart needed** — no code path reads from `docs/operations/licenses/`
- **No re-mint needed** — the JSON in this PR is the same one already delivered to mpham via Zalo on 2026-05-29

## ⚠️ Cleanup item — stale branch

There's a stale local branch on this dev box: `chore/operator-licenses-registry` (last commit `6383635 PR #93`). It was created mid-sprint but never got the licenses work pushed to it — instead the work landed in the working tree as untracked files (now committed in PR #98). The stale branch contains NO licenses content; it's just a behind-main snapshot.

Safe to delete after PR #98 merges:

```bash
git branch -D chore/operator-licenses-registry
```

(Agent did NOT delete it autonomously per "destructive ops require user ask" policy.)

## Refs

- License pipeline: [`scripts/license/generate-license.mjs`](../../../scripts/license/generate-license.mjs)
- Dev keypair: [`scripts/license/dev-private.pem`](../../../scripts/license/dev-private.pem) + [`scripts/license/dev-public.pem`](../../../scripts/license/dev-public.pem)
- Runtime verification: [`desktop/license.js`](../../../desktop/license.js) + [`desktop/license.test.js`](../../../desktop/license.test.js)
- Server-side: [`server/services/licenseService.js`](../../../server/services/licenseService.js) + tests
- Companion ops runbook: [`docs/operations/version-banner.md`](../version-banner.md) (P0 banner pattern reference)
- Win EXE 1.5.12 build artifacts (D-7 distribution): [`4. CLAUDE OUTPUT/HANDOFF-LEAD-v1.5.12.md`](../../../4.%20CLAUDE%20OUTPUT/HANDOFF-LEAD-v1.5.12.md)

— Generated 2026-05-29 16:50 ICT by Claude Code agent (PR #98)
