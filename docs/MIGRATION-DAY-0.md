# Day-0 Migration Playbook

> 7-step checklist for production deployment of Ops Control v1.5.x.
> Run on D-1 of any cutover; verify success criteria at each step
> before proceeding to next. Closes audit finding P0-6.

> **Role clarification (2026-05-25 discovery)**: At CCL Vietnam Yen Phong, "Sysadmin" is a functional role held by the Lead Engineer (Đặng Thế Thiệp). Every "Owner: Sysadmin" line in this playbook = Lead Engineer executing the sysadmin function. Backup Engineer (Trần Thị Hương) is the standby for sysadmin tasks during Lead unreachable incidents — she has SSH + NSSM + cron skills confirmed via phone 2026-05-25.

## Audience

- **Sysadmin** (= Lead Engineer Đặng Thế Thiệp at CCL Vietnam; functional role only — see role-clarification above)
- **Lead Engineer** (approver — verifies each step gate before next)
- **Plant Manager** (sign-off — receives final OK email)

## Pre-conditions

Verify ALL before starting Day-0 migration:

- [ ] CI green on the release tag (`git tag v1.5.10` + commit on main)
- [ ] Both Mac DMG + Windows EXE installers built + uploaded to `<updates-dir>`
- [ ] Backup activation in prod `.env` (P0-1; PROMPT 7 deliverable)
- [ ] Off-site backup target writable (P0-2)
- [ ] `releases/` directory exists on prod (P1-2 deploy.ps1 snapshot patch; PR #71)
- [ ] All 20 operator accounts provisioned (P1-5; provisioning-card flow)
- [ ] `ops_test_user` deleted from prod users.json (P1-5; PR #68 + ops action)
- [ ] Plant Manager email sign-off on file

## Step 1 — Pre-deploy baseline backup

**Owner**: Sysadmin
**Acceptance**: Backup file <30 minutes old at expected path.

```bash
ssh user@10.102.3.61
cd /opt/ops-control

# Run on-demand backup (PROMPT 7 adds `npm run backup:run`):
npm run backup:run
# Fallback if backup:run not yet available (pre-PROMPT 7):
# node -e "import('./server/services/backupScheduler.js').then(m=>m.runBackupCycle({force:true}).then(s=>{console.log(JSON.stringify(s,null,2)); process.exit(s.ok?0:2);}))"

# Verify file landed
ls -lt server/data/Backup/SQLite/ | head -3
ls -lt server/data/Backup/Library/ | head -3
```

**Rollback if step fails**: Cannot proceed. Restore most recent backup, investigate, retry.

## Step 2 — Rsync data files to fresh install

**Owner**: Sysadmin
**Acceptance**: All 15 Library entities present in `server/data/Library/`.

```bash
# From engineer's Mac (or wherever Data for import/ lives):
rsync -avz "Data for import/data/Library/" user@10.102.3.61:/opt/ops-control/server/data/Library/
```

Verify on remote:

```bash
ssh user@10.102.3.61
cd /opt/ops-control
ls server/data/Library/ | sort
# Expect 15 entries:
# DDL, DesignTools, Finance, IFS_Inventory, InkCalc, MachineProfiles,
# MachineTechnical, Manufacturing_Structures, MaterialCost,
# PermissionGroups, PrintArea, QuoteHistory, RFQTracker, Rate,
# ReleasedQuotation
```

**Rollback if step fails**: Restore from Step 1 backup.

## Step 3 — Permission lockdown

**Owner**: Sysadmin
**Acceptance**: All sensitive files `-rw-------` (mode 600).

```bash
ssh user@10.102.3.61
cd /opt/ops-control
chmod 600 .env
chmod 600 server/data/Library/Users/users.json
chmod 600 server/data/Library/Users/totp_secrets.* 2>/dev/null || true
chmod 600 server/data/ops.db 2>/dev/null || true
ls -la server/data/Library/Users/
```

The OS account running `ops-control` is the trust boundary — anyone with shell access to the data dir can mint a sys user via `scripts/recover-sys-user.js`. Verify the deploy user is the only account with `r/w` on these files.

## Step 4 — Dry-run migration to SQLite

**Owner**: Lead Engineer (joint sysadmin + decision-maker function)
**Acceptance**: Parity report shows zero conflicts. Exit code 0.

```bash
ssh user@10.102.3.61
cd /opt/ops-control
node scripts/migrate-to-sqlite.js --dry-run
echo "Exit: $?"   # must be 0
```

> **Note**: invoke the script by file path. `npm run migrate` points to a **different** script (`migrate-planning-data.js`) and is NOT the Day-0 migrator.

Output shows row counts + checksums per dataset (bom / routing / inventory / materials). Lead Engineer reviews — any mismatch = STOP + triage.

Capture the dry-run row counts to a scratch note (used in Step 7 verification — the smoke manual confirms migrated row counts match what dry-run reported).

**Rollback if step fails**: Source files may be malformed. Re-export from operator's Excel, retry.

## Step 5 — Commit migration

**Owner**: Sysadmin
**Acceptance**: Row counts match dry-run report from Step 4.

```bash
node scripts/migrate-to-sqlite.js --commit
echo "Exit: $?"   # must be 0
```

If a specific dataset failed in dry-run + got fixed at source, migrate only that one:

```bash
node scripts/migrate-to-sqlite.js --commit --dataset=materials
```

Last resort if `--commit` refuses due to a pre-existing partial migration:

```bash
node scripts/migrate-to-sqlite.js --commit --force
# Use only AFTER Step 1 backup exists and Lead Engineer approves
```

**Rollback if step fails**: Restore from Step 1 backup, retry from Step 4 with `--force` if needed.

## Step 6 — Preflight gate

**Owner**: Sysadmin
**Acceptance**: Exit code 0.

```bash
NODE_ENV=production npm run preflight
echo "Exit: $?"   # MUST be 0; otherwise ABORT
```

Preflight verifies:

- All required env vars present (`OPS_TOTP_KEY`, `OPS_KIOSK_KEY`, `OPS_EXPORT_HMAC_KEY`)
- Each env var format valid (64-hex)
- Data dir writable
- SQLite reachable

If preflight fails on a missing env var: check `.env.example` for the canonical block + comments (per PR #68, `OPS_KIOSK_KEY` block was added there as documentation), copy the format, generate a fresh value via the documented `node -e "...randomBytes..."` one-liner, add to prod `.env`, retry.

**Rollback if step fails**: Restore from Step 1 backup. Investigate env vars before retry.

## Step 7 — Smoke manual

**Owner**: Lead Engineer
**Acceptance**: All checks pass.

Open client UI in browser (`http://10.102.3.61:3000`):

- [ ] Login as a known operator account (NOT `ops_test_user` — that account is deleted per P1-5)
- [ ] Quote History loads ≥ N quotes (N = pre-migration row count from Step 4 dry-run report)
- [ ] Materials tab shows ≥ N rows (per dry-run report)
- [ ] Rate dropdown lists 7 sites (Yen Phong, Linh Trung, …)
- [ ] Settings → About shows the expected version string (e.g. `v1.5.10`)
- [ ] No console errors in browser DevTools on tab switch through the 6 main tabs

**Rollback if any check fails**: Restore from Step 1 backup. Triage discrepancy before retry.

## Owner-of-record table (per Library entity)

| Library entity           | Owner role                        | Verify after migration                                  |
| ------------------------ | --------------------------------- | ------------------------------------------------------- |
| DDL                      | Admin (NPI Lead)                  | DDL Library tab shows expected options                  |
| DesignTools              | NPI Lead                          | Design Tools tab Gallus presets render                  |
| Finance                  | Finance Lead                      | Finance Library tab                                     |
| IFS_Inventory            | NPI Lead (mirror from IFS export) | Settings → Inventory tab                                |
| InkCalc                  | NPI Lead                          | InkCalculator tab default values present                |
| MachineProfiles          | Production Lead                   | Design Tools tab Gallus presets render                  |
| MachineTechnical         | Production Lead                   | Machine details visible in MachineProfiles              |
| Manufacturing_Structures | NPI Lead                          | BOM data — Planning tab → BOM Explosion (gated v1.5.11) |
| MaterialCost             | NPI Lead                          | Materials tab shows expected row count                  |
| PermissionGroups         | Sys role                          | All operator roles visible in user-edit modal           |
| PrintArea                | NPI Lead                          | Print Area Calc tab functional                          |
| QuoteHistory             | Sales Lead                        | Quote History tab loads expected count                  |
| RFQTracker               | Sales Lead                        | RFQ Tracker tab kanban renders                          |
| Rate                     | Finance Lead                      | Rate sub-tab                                            |
| ReleasedQuotation        | Sales Lead                        | Quote History → Released filter                         |

Owner is the operational owner — first point of contact if that entity's data looks wrong post-migration. Lead Engineer (sysadmin function) escalates by entity, not by user. Backup Engineer (Hương) covers if Lead unreachable.

## Rollback chain

For every step that fails:

1. **Stop the deploy script** (don't proceed to next step)
2. **Restore last good state**:
   - Server install: `releases/<prev-ts>/` via Rollback Runbook A (deploy.ps1 snapshot, P1-2)
   - Data files: backup from Step 1 (`server/data/Backup/SQLite/ops_<ts>.sqlite`)
3. **Verify rollback**: `npm run verify-backup <backup-file>` exits 0
4. **Investigate failure** before retry — never blind-retry the same step

Full rollback procedure: `docs/cutover/ROLLBACK-RUNBOOK-20260522.md`.

## Post-deploy verification (D-1 EOD)

12-point checklist from cutover plan §"Success criteria":

- [ ] CI green on `main`
- [ ] UAT sign-off committed
- [ ] Plant Manager sign-off email
- [ ] Backup file <24h old
- [ ] Off-site backup verified
- [ ] v1.5.10 tag + both installers built
- [ ] Operator training attendance ≥18/20
- [ ] All 20 user accounts provisioned + `ops_test_user` deleted
- [ ] Cheat-sheets at every kiosk + workstation
- [ ] Stash list empty on all boxes
- [ ] Multi-tier export P0 verified end-to-end on prod
- [ ] Audit emit verified for quote save + library save

Full plan: `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` (D-1 section).

## Recovery references

- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Rollback Runbook A (software) + B (operational Excel fallback)
- `CLAUDE.md` "Recovery playbook" section — older detailed runbooks
- `CLAUDE.md` "TOTP key rotation runbook" — if 2FA lockout
- `CLAUDE.md` "All admin/sys users lost access" — chicken-and-egg recovery via `scripts/recover-sys-user.js`

---

**End of Day-0 Migration Playbook. Companion documents**:

- `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md` — original audit source for P0-6
- `docs/cutover/SCHEDULE_DECISION_2026-05-24.md` — go-live date schedule
- `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` — sequenced D-1 → D+7 cutover plan
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — software + operational rollback procedures
