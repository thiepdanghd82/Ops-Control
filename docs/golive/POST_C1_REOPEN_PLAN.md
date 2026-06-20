# POST-C-1 ENGINEERING REOPEN PLAN

## Probability-weighted pre-stage · Lập kế hoạch theo xác suất

**Status**: Engineering SOFT-FREEZE active until C-1 scope-lock closes.
**Purpose**: Eliminate latency between C-1 outcome and engineering reopen. Investment proportional to scenario probability — Scenario A gets a ready-to-run plan; B/C get triggers only.

> **Allocation principle**: A is 65% likely + already scoped in `docs/retention/audit-chain.md` Phase 2.2a-d, so detailed prep is cheap. B is 20% — only needs a trigger so we're not caught flat-footed. C is 15% and means the project re-charters — premature planning is wasted work.

---

## 🟢 Scenario A (Mac-only YES, ~65%) — Ready-to-run plan

**Trigger condition**: C-1 workshop closes with all of:

- Q1 = (a) Hai Duong-only pilot
- Q2 = A (off-site backup = Hybrid)
- Q7 = (a) Mac-only accepted

**On trigger**:

1. Update `project_golive` memory: C-1 ✅ DONE, freeze LIFTED
2. Notify Hương + sales via Zalo: scope locked Mac-only, on track for 2026-08-30
3. Begin **S-AUDIT-CHAIN-WIRE sprint** (Phase 2.2a-d) — sequence below

### Why audit-chain reopen first

- **Scope-independent**: works regardless of Win/Web answer (purely server-side hardening)
- **Already foundation-shipped**: PR landed primitives + verifier + 21 tests on 2026-06-20. Wiring is ~30 LOC per step.
- **Hypercare D+7-14 forensic depth**: tamper-evident audit trail is the single highest-impact backstop for the 20-year retention claim if a stakeholder dispute surfaces.
- **Pre-scoped tickets exist**: S-AUDIT-CHAIN-WIRE-AUTH / SQLITE / MIGRATE / CRON (see `docs/retention/audit-chain.md:152-155`)

### PR sequence (1 PR = 1 phase, mandatory order)

| #   | Sprint                  | Phase | Touches                                  | Effort | Risk | Acceptance                                      |
| --- | ----------------------- | ----- | ---------------------------------------- | ------ | ---- | ----------------------------------------------- |
| 1   | S-AUDIT-CHAIN-WIRE-AUTH | 2.2a  | `authService.js audit()`                 | S      | M    | tamper detection works E2E + perf < 1ms/call    |
| 2   | S-AUDIT-CHAIN-SQLITE    | 2.2b  | `audit_log` table + `auditStore.js`      | M      | M    | new rows carry prev_hash+hash; legacy untouched |
| 3   | S-AUDIT-CHAIN-MIGRATE   | 2.2c  | one-shot genesis script                  | S      | M    | CHAIN_INIT row anchored on staging copy first   |
| 4   | S-AUDIT-CHAIN-CRON      | 2.2d  | nightly verify cron + startup probe gate | S      | L    | verify CLI runs nightly + alerts on break       |

**Hard ordering**: 2.2a + 2.2b can ship together (both touch wire-in) but MIGRATE (2.2c) MUST run AFTER both deployed (needs the schema fields). CRON (2.2d) MUST run AFTER MIGRATE.

### Per-PR detail

#### PR 1 — S-AUDIT-CHAIN-WIRE-AUTH (Phase 2.2a)

**Scope**:

- Modify `server/services/authService.js audit()` to call `appendHashed(_lastHash, row)` before persisting
- Module-level `_lastHash` cache hydrated from last row on `authService.init()`
- Failure mode: if hash computation throws, log error + persist UNCHAINED row (don't lose the audit entry)

**Test plan**:

- Add ~50 LOC integration test: spy on `_auditDualWrite`, assert each new row carries `prev_hash` + `hash`
- Assert chain breaks visible: mutate row 5 in `audit_log.json` → `verify-audit-chain.mjs` returns `{ok:false, breakIndex:5}`
- Performance bench: 1000 sequential `audit()` calls + assert avg < 1ms each (sha256 of <500-byte JSON)
- **CODEOWNERS**: `authService.js` is on critical-paths list (`.github/CODEOWNERS:31`) — review required from Henry

**Acceptance**:

- All existing `authService.audit()` callsites continue passing (no API change)
- New rows carry prev_hash + hash; verifier CLI passes on full log
- Server boot ≤ 5s additional cold-start (hydrating `_lastHash` from last row)

**Hardware test gate**: Required. Build SERVER DMG + smoke 30 quote saves + verify chain holds.

#### PR 2 — S-AUDIT-CHAIN-SQLITE (Phase 2.2b)

**Scope**:

- Add `prev_hash TEXT, hash TEXT` columns to `audit_log` table via migration v2 in `server/db/migrations/`
- Update `repositories/auditStore.js` INSERT to include the 2 new columns
- Read paths unchanged (backward compatible — old rows have NULL hash columns, new rows populated)

**Migration choice**: `ALTER TABLE ADD COLUMN` (nullable). Fast, in-place, no shadow-swap complexity. Risk: blocks reads ~10-100ms on 100k-row table — acceptable for the migration window (run during nightly backup window or off-hours).

**Test plan**:

- Migration runs idempotent on copy of production DB
- Old rows queryable + display (NULL hash → render "—" in any future audit UI)
- New rows carry both columns + match `audit_log.json` hash from PR 1 wire

**Acceptance**:

- Migration ran successfully on staging copy with 1000+ historical rows
- Performance regression check: SELECT \* FROM audit_log ORDER BY id DESC LIMIT 100 still < 50ms (the new index helps)

**Hardware test gate**: Required on copy of production DB before prod deploy.

#### PR 3 — S-AUDIT-CHAIN-MIGRATE (Phase 2.2c)

**Scope**: One-shot `scripts/migrate-audit-chain-init.mjs`:

1. Reads existing `audit_log.json` + `SELECT * FROM audit_log`
2. Computes `preChainFingerprint` for both backends (canonical-JSON sha256 over all current rows)
3. Appends one `CHAIN_INIT` entry via `buildGenesisEntry` to BOTH backends
4. Subsequent `audit()` calls anchor chain to this genesis

**🚨 Genesis migration guardrail** (CRITICAL — runs ONCE per env, irreversible):

- Script REFUSES to run if `CHAIN_INIT` row already exists (idempotency check)
- Pre-flight: dumps fingerprints + asks `Y/CONFIRM-GENESIS` interactive prompt
- Pre-flight: stops if `audit_log.json` and SQLite have row-count mismatch (> 5 row delta) — points to undetected drift
- Backup-before-migrate: script writes `audit_log.json.before-genesis-<ts>` + dumps SQLite to `audit_log.before-genesis-<ts>.sql` before any write
- On error: rolls back BOTH backends from the backups it just took, exits non-zero

**Run order**:

1. STAGING first (Henry runs on copy of prod data)
2. Verify CLI passes on migrated staging file
3. Manual audit() append from staging → verify chain extends correctly
4. Tamper a row → verify CLI fails with correct breakIndex
5. ONLY THEN run on prod (Henry SSH session, during low-traffic window)

**Acceptance**:

- Genesis CHAIN_INIT row visible in both backends
- Verifier CLI returns `{ok:true, count:N}` post-migrate
- Subsequent audit() append chains from CHAIN_INIT hash

**Hardware test gate**: Mandatory dry-run on staging copy. Henry SSH-runs prod migration in supervised window.

#### PR 4 — S-AUDIT-CHAIN-CRON (Phase 2.2d, P2 post-go-live week 1)

**Scope**:

- Nightly cron on prod: `0 2 * * * cd /opt/ops-control && node scripts/verify-audit-chain.mjs --json | jq -e '.ok' > /dev/null || alert "audit-chain broken on $(hostname)"`
- Windows NSSM equivalent: Task Scheduler + PowerShell wrapper (mirror pattern from bit-rot cron)
- Optional startup probe via `OPS_VERIFY_AUDIT_CHAIN=1` env gate (adds ~50ms boot for 10k entries — opt-in)
- Hương deploys via runbook update (bundle with C-4 drill day learning — mirror bit-rot deploy pattern from `docs/ops/C4_DRILL_RUNBOOK.md`)

**Test plan**: Simulate broken chain on staging → verify cron exits 1 + alert fires.

**Acceptance**: Cron installed + first nightly run completes + alert path tested via deliberate tamper-then-restore.

### Sprint sequence + timeline

| Wk          | PR                             | Trigger                     | Owner                      | Hardware test                   |
| ----------- | ------------------------------ | --------------------------- | -------------------------- | ------------------------------- |
| Wk 1 (D-58) | 1 + 2 (combined or sequential) | Workshop closed Scenario A  | Henry                      | Yes (SERVER DMG)                |
| Wk 2 (D-51) | 3 (genesis migration)          | PR 1+2 merged + 7-day soak  | Henry                      | Yes (staging + prod supervised) |
| D+7         | 4 (cron deploy)                | Post-go-live Hypercare week | Hương (with Henry observe) | Bundle into ops drill           |

**Total effort**: ~3 weeks elapsed, ~5 PR-days of work. Fits comfortably in remaining D-71 buffer.

### Out of scope (defer to v1.6.1+)

- HMAC chain extension (signed hash, not just sha256) — requires separate key management discussion
- Off-site chain anchor (publish chain head to immutable store quarterly) — R12 RFC 3161 timestamping work, scope-dependent on C-1 Q3 (legal vs business)
- Per-tenant chain isolation — only relevant if Q1 = (b) multi-site (different scenario)

---

## 🟡 Scenario B (Win-in-D-0, ~20%) — Trigger outline only

**Trigger condition**: C-1 workshop closes with Q7 = (b) "must include Windows in v1.6".

**On trigger** (decision sequence, NOT a full plan):

1. Pause this `POST_C1_REOPEN_PLAN.md` Scenario A path
2. File `S-V1.6-WIN-PORT-D0-INCLUSION` blocking ticket
3. Choose negotiation outcome from `C1_PRE_MORTEM.md` §🟡 Scenario B (B1 slip / B2 phased / B3 defer)
4. Update `SCOPE_LOCK_v1.6.md` + `DEFERRAL_ROADMAP.md` to reflect new D-0
5. **Defer audit-chain wire (S-AUDIT-CHAIN-WIRE-AUTH etc.) to v1.6.1** — Win port consumes engineering capacity
6. Restart engineering with new sprint plan once SCOPE_LOCK re-signed (target within 7 days of workshop)

**Reason for outline-only**: Win port is ~120h work — scoping requires environment access (Win VM, electron-builder cross-compile verification, ABI testing on NMV 137) that's not productive to prep speculatively. Full plan written when triggered.

---

## 🔴 Scenario C (Web/Hybrid in D-0, ~15%) — Trigger only

**Trigger condition**: C-1 workshop closes with any of:

- Q1 = (b) global multi-site in v1.6
- Q2 = B/C/D (cloud component in v1.6)
- Q7 = (b) or (c) plus Q2 web/cloud

**On trigger**:

1. **STOP all engineering activity** — including any reopen prep
2. File `S-V1.6-RE-CHARTER-2026-06-26` (or whatever workshop date)
3. Escalate to Henry's manager + stakeholder leadership immediately
4. Schedule re-charter meeting within 5 business days
5. Use `C1_PRE_MORTEM.md` §🔴 Scenario C capacity math (400h available vs 650-900h demand) as escalation memo
6. Re-charter options:
   - Slip go-live to 2027-Q1 (recommended counter-proposal)
   - Add 2nd engineer for capacity (budget impact)
   - Reduce stakeholder scope ask back to Scenario A (preferred outcome)

**Re-plan checklist (only when re-charter mandate confirmed)**:

- [ ] New project charter document (replaces v1.6 plan)
- [ ] Updated capacity model (engineers × weeks × scope)
- [ ] Revised timeline + revised D-0
- [ ] Renegotiate stakeholder commitments + budget approval
- [ ] Communicate to Hai Duong site (pilot won't happen 2026-08-30)
- [ ] Decide v1.5.12 Mac DMG distribution as interim (operators may need stop-gap)

**Reason for trigger-only**: Re-charter is leadership decision space, not engineering planning space. Building speculative plans pre-decision wastes effort.

---

## Cross-reference

- `docs/golive/C1_WORKSHOP_AGENDA.md` — Path A live workshop
- `docs/golive/C1_ASYNC_SIGNOFF.md` — Path B async (explicit-ack)
- `docs/golive/C1_DECISION_LOG.md` — capture template
- `docs/golive/C1_PRE_MORTEM.md` — outcome scenarios + counter-actions
- `docs/retention/audit-chain.md` — Phase 2.2 foundation + 2.2a-d ticket descriptions
- `docs/ops/C4_DRILL_RUNBOOK.md` — pattern for cron-deploy-via-Hương (audit-chain cron mirrors bit-rot)
- [project_golive memory] — HOLD status until C-1 resolves
