# Audit Log Hash Chain — Phase 2.2 Rollout Plan

**Date:** 2026-06-20 (Phase 2.2 foundation shipped) • **Owner:** Henry • **Target compliance:** SOX-style tamper-evident audit log for 20-year retention

> Audit log hiện là JSON append-only — bất kỳ ai có file access có thể rewrite history. Phase 2.2 ship FOUNDATION (chain primitives + verify CLI + tests). Wire-into-production = 3 separate steps (2.2a/b/c) cần Henry sign-off riêng vì touch load-bearing code.

## Threat model

| Attacker                             | Capability                      | Caught without chain?                                                                        | Caught with chain?                                     |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Operator with shell access           | Edit `audit_log.json`           | NO — silent rewrite                                                                          | YES — verifier fails with breakIndex                   |
| Sys-admin (legitimate but malicious) | Insert/delete entry             | NO                                                                                           | YES                                                    |
| External attacker via SQL injection  | Modify `audit_log` SQLite table | NO                                                                                           | YES (if chain wired to SQLite)                         |
| Backup tape physical theft           | Replace tape contents           | NO                                                                                           | Partial — fingerprint anchors compare against off-site |
| Compromised key + log rotation       | Forge chain after-the-fact      | YES (chain prevents); attacker must have hash chain validation key too if HMAC variant added | YES with HMAC chain extension                          |

## Phased rollout

### Phase 2.2 — FOUNDATION (shipped 2026-06-20, this PR)

**What:** Pure primitives + tests + CLI verify tool. **Zero production behavior change.**

| File                                 | Purpose                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `server/services/auditChain.js`      | `canonicalEntryJson`, `hashEntry`, `appendHashed`, `preChainFingerprint`, `buildGenesisEntry`, `verifyChain` |
| `server/services/auditChain.test.js` | 21 unit tests covering clean/mutated/inserted/deleted/reordered/legacy scenarios                             |
| `scripts/verify-audit-chain.mjs`     | CLI: read JSON audit log, run verifier, exit 0/1/2                                                           |

**Acceptance:**

- 21/21 helper tests green
- CLI prints "OK — N pre-chain rows, no CHAIN_INIT yet (legacy log)" on current production audit_log.json (because chain not activated yet)
- Zero changes to `authService.audit()` or SQLite schema

### Phase 2.2a — WIRE INTO `audit()` (DEFERRED — Henry sign-off)

**What:** Modify `server/services/authService.js audit()` to call `appendHashed(prevHash, row)` before persisting.

**Why deferred:**

- `authService.js` is on CODEOWNERS critical-paths list (`.github/CODEOWNERS:31`)
- Changes load-bearing code path that runs on every login / permission check / quote save
- Failure mode: if hash computation throws, audit row is lost → silent observability gap

**Implementation outline:**

```js
// Before persisting, in audit():
import { appendHashed } from './auditChain.js';

let _lastHash = null; // module-level, hydrated from last row on init

export function audit(event, user, ip, detail) {
  const row = { ts: new Date().toISOString(), event, user, ip, detail };
  const chained = appendHashed(_lastHash, row);
  _lastHash = chained.hash;
  _auditDualWrite(chained);
  _auditLog.push(chained);
  // ...
}
```

**Required before wire:**

1. Migration script (Phase 2.2c) runs first to anchor CHAIN_INIT
2. `_lastHash` initializer reads last row from `audit_log.json` OR `SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1`
3. Smoke test: tamper detection works end-to-end (audit() → persist → verify CLI surfaces tamper)
4. Performance bench: hash computation < 1ms per audit call (sha256 of <500-byte JSON is trivially fast on Node 24)

**Effort:** S (~30 LOC + ~50 LOC test)

### Phase 2.2b — SQLITE SCHEMA EXTEND (DEFERRED — Sprint 30 coupling)

**What:** Add `prev_hash TEXT, hash TEXT` columns to `audit_log` table. Update `repositories/auditStore.js` to write + read these fields.

**Why deferred:**

- SQLite schema migration in production = potentially risky on large audit_log table (100k+ rows expected over 5 years)
- Need to decide: migrate in-place (ALTER TABLE — fast, blocks reads briefly) or shadow-table-swap (zero-downtime, complex)
- Better-sqlite3 ALTER TABLE is non-trivial because it doesn't support adding NOT NULL columns to non-empty tables without DEFAULT

**Implementation outline:**

```sql
-- v2 migration in server/db/migrations/
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN hash TEXT;
CREATE INDEX idx_audit_hash ON audit_log(hash);
```

Then update `appendAudit(row)` INSERT statement to include the two new columns.

**Effort:** M (~80 LOC migration + repo update + tests, plus 1-2h hardware verify on copy of production DB)

### Phase 2.2c — GENESIS MIGRATION (DEFERRED — runs ONCE per environment)

**What:** One-shot script `scripts/migrate-audit-chain-init.mjs` that:

1. Reads existing `audit_log.json` (file) + `SELECT * FROM audit_log` (SQLite)
2. Computes `preChainFingerprint` for both
3. Appends a single `CHAIN_INIT` entry via `buildGenesisEntry` to BOTH backends
4. Subsequent `audit()` calls (after Phase 2.2a wired) anchor to this genesis

**Why deferred:**

- Must run AFTER Phase 2.2a + 2.2b are deployed (chain fields available)
- One-shot, irreversible — better to verify on staging copy of prod data first
- Backup-before-migrate procedure documented in main.js runbook

**Smoke test plan:**

1. Copy `audit_log.json` from prod to staging
2. Run migration script in staging
3. Verify last entry = CHAIN_INIT with valid hash
4. Verify CLI passes on the migrated file
5. Verify next manual audit() append chains correctly
6. Re-tamper a row → verify CLI fails with correct breakIndex

**Effort:** S (~80 LOC script + ~50 LOC smoke test)

### Phase 2.2d — CI / cron wire (DEFERRED — after 2.2a-c green)

**What:** Add nightly cron + optional startup probe.

**Nightly cron** (Linux):

```cron
0 2 * * * cd /opt/ops-control && node scripts/verify-audit-chain.mjs --json | jq -e '.ok' > /dev/null || /usr/local/bin/alert "audit-chain broken on $(hostname)"
```

**Windows NSSM service**: equivalent via Task Scheduler + PowerShell wrapper.

**Startup probe** (optional, adds ~50ms boot for 10k entries): add to `server/index.js` boot sequence with `OPS_VERIFY_AUDIT_CHAIN=1` env gate.

**Pre-rotate-keys gate**: before TOTP / OPS_EXPORT_HMAC_KEY rotation, run verify to capture an authenticated chain snapshot.

## Recovery playbook (when verify CLI fails)

1. **DO NOT panic-restore** — broken chain may be legitimate (Phase 2.2a wire bug, file corruption mid-write, network partition during dual-write)
2. Run `node scripts/verify-audit-chain.mjs --json` to capture exact `breakIndex` + `message`
3. Diff `audit_log.json` (file) vs `SELECT * FROM audit_log` (SQLite) for the broken index — if one is intact, the other is corrupted (restore from intact source)
4. If both corrupted: restore `audit_log.json` from previous nightly backup, accept loss of audit entries since last backup, file incident report in `docs/break-glass/<date>-audit-chain-restore.md`
5. Notify Henry + Hương; chain is broken → forensic trail for the window between break and restore is compromised; may require SOX disclosure depending on regulatory regime (consult legal)

## Cross-reference

- [Re-evaluation R-3](../../) — 20-year retention strategy
- [B-2 R3 12-control matrix](../../) — Hash-chain integrity as Tier-1 control
- [Phase 0 closeout](../ci/branch-protection-policy.md) — CODEOWNERS rule applies to authService.js (Phase 2.2a load-bearing)
- [Lesson 7](../../CLAUDE.md) — cross-validate sub-agent claims (audit hardening = security-sensitive, mandatory grep)
- Filed follow-up tickets:
  - **S-AUDIT-CHAIN-WIRE-AUTH** (P1 pre-go-live) — Phase 2.2a
  - **S-AUDIT-CHAIN-SQLITE** (P1 pre-go-live) — Phase 2.2b
  - **S-AUDIT-CHAIN-MIGRATE** (P1 pre-go-live) — Phase 2.2c after 2a+2b green
  - **S-AUDIT-CHAIN-CRON** (P2 post-go-live week 1) — Phase 2.2d
