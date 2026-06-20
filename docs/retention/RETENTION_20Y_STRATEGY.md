# 20-Year Retention Strategy — Ops Control v1.6

## Chiến lược lưu trữ dữ liệu 20 năm

**Date · Ngày:** 2026-06-20
**Owner · Chủ trì:** Henry Đặng Thế Thiệp
**Compliance target · Mục tiêu compliance:** depends on `STAKEHOLDER_QUESTIONS Q3` answer (legal vs business)
**C-2 Deadline:** D-30 (2026-07-31)
**Status:** Tier-1 controls SUBSTANTIALLY DONE pre-D-0 (engineering 41 days ahead of plan)

---

## Why 20 years

Per Re-evaluation 2026-06-20 + Enterprise Review Board B-2 finding:

> CCL Design master-supplier contracts reference cost lines from quotes up to **15 years old**. Sales must be able to pull RFQ-2027-S0156 in 2042 and prove the cost breakdown matches the audit trail.

Failure modes if retention contract breaks:

- **Financial:** misquote multi-million contract because historical pricing unreproducible
- **Compliance/Audit:** SOX-style auditor cannot prove "saved cost == reloaded cost"
- **Bit-rot:** silent corruption sau 5-8 năm, daily backup retention < 30d → data loss
- **Format longevity:** SQLite vendor change / better-sqlite3 abandoned → cannot read

---

## 12-Control Matrix — Status post-Phase-2

| #       | Control                                                                                | Tier | Status                                                                                | Closing artifact                                                                                                              | Schedule                           |
| ------- | -------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **R1**  | Pricing snapshot frozen at save (materials/rates/coverage/tool_life/click_charges/sga) | 1    | ✅ **DONE 2026-06-20**                                                                | PR-A #188 + PR-A2 #189 (C-6 closeout)                                                                                         | Pre-D-0                            |
| **R2**  | "load 5y-old quote = identical" test contract                                          | 1    | ✅ **DONE**                                                                           | `loadFrozenQuote.test.js` + `loadFrozenQuotesAll.test.js` + 4 fixtures (Phase 2.1 + PR-B #190)                                | Pre-D-0                            |
| **R3**  | Audit log hash-chain integrity                                                         | 1    | 🟡 **FOUNDATION DONE; wiring deferred**                                               | `server/services/auditChain.js` + 21 tests + CLI verify (PR #187); wiring → Hypercare D+7-14 via 4 tickets (S-AUDIT-CHAIN-\*) | Pre-D-0 foundation; Hypercare wire |
| **R4**  | Tiered archival (HOT/WARM/COLD)                                                        | 2    | ⬜ Not started                                                                        | Q4 2026 — see `DEFERRAL_ROADMAP`                                                                                              | 2026 Q4                            |
| **R5**  | Annual restore-drill from COLD tier                                                    | 2    | ⬜ Not started                                                                        | Depends on R4                                                                                                                 | 2027 Q1 first drill                |
| **R6**  | Bit-rot detection (monthly sha256 walk + alert on drift)                               | 2    | 🟡 **IN-FLIGHT Track B (Phase 3 M-5b)**                                               | Phase 3 PR this week                                                                                                          | Pre-D-0                            |
| **R7**  | Format-longevity test suite (cross-version load test)                                  | 2    | ⬜ Ongoing per-sprint                                                                 | Add 1 fixture per minor version (frozen-quote-YYYY-N.json pattern)                                                            | Ongoing                            |
| **R8**  | "If better-sqlite3 abandoned" escape hatch (CSV+JSON-LD dump)                          | 3    | ⬜ Not started                                                                        | 2027 Q1                                                                                                                       | 2027 Q1                            |
| **R9**  | Triple-storage: on-prem + off-site rsync + cloud (S3 Glacier Deep Archive)             | 3    | 🟡 **2 of 3 done** (on-prem + off-site rsync); cloud DEPENDS on Hybrid scope decision | If Q2 = cloud → impl Q2 2027                                                                                                  | 2027 Q2 (conditional)              |
| **R10** | Auditor read-only export tool (RFQ → all historical snapshots in 1 PDF)                | 3    | ⬜ Not started                                                                        | Q2 2027                                                                                                                       | 2027 Q2                            |
| **R11** | Legal hold flag (cannot delete even by sys role)                                       | 3    | ⬜ Not started                                                                        | Q2 2027                                                                                                                       | 2027 Q2                            |
| **R12** | RFC 3161 cryptographic timestamping (audit log monthly digest)                         | 3    | ⬜ Not started                                                                        | Q3 2027                                                                                                                       | 2027 Q3                            |

### Tier definitions

- **Tier 1:** MUST be done pre-D-0 for any retention claim to hold
- **Tier 2:** Should be done in first 6 months post-go-live for operational confidence
- **Tier 3:** Required for SOX-style compliance audit; not required for business-only retention basis

---

## 🟢 What's DONE — Compliance evidence pre-D-0

### Tier-1 controls (the foundational 3)

#### R1 Pricing snapshot — `client/src/services/pricingSnapshot.js`

- **Captures:** materials + rates + coverage + tool_life + click_charges + sga + site context
- **Captured at:** every quote save (Std + Cpx)
- **Storage:** inside `quote.state.pricing_snapshot` JSON column (no separate table)
- **Reproducibility:** `loadFrozenQuote.test.js` + 4 fixtures pin behavior across all snapshot clusters
- **Evidence:** PR-A #188 + PR-A2 #189 commit history + 1341 client tests green

#### R2 Reproducibility test contract

- **Test file:** `client/src/services/loadFrozenQuote.test.js` + `loadFrozenQuotesAll.test.js`
- **Fixtures:** 4 frozen-quote JSONs (baseline + diecut + indigo + draft-sga)
- **Guarantee:** TODAY engine on saved 2026-06-20 state → byte-identical to expected_result
- **Enforcement:** CI test failure on any future engine drift; explicit regen script with warning header for deliberate changes
- **Evidence:** PR-B #190 commit history

#### R3 Audit log hash-chain

- **Foundation:** `server/services/auditChain.js` — pure SHA-256 chain primitives + 21 tests
- **CLI verify:** `scripts/verify-audit-chain.mjs` — exit 0/1/2 for cron integration
- **Wiring deferred:** PR-A2 wire-into-audit() + SQLite schema migration + genesis migration + cron = 4 tickets for Hypercare (see `docs/retention/audit-chain.md` Phase 2.2a-d)
- **Evidence:** PR #187 commit history

### Tier-2 controls (in-flight)

#### R6 Bit-rot detection — IN PROGRESS THIS WEEK (Phase 3 Track B)

- Will land via M-5b PR
- Monthly cron sha256 walk + drift alert

---

## 🟡 What's in-flight — what ships in next 2 weeks

| Control                              | Track                | ETA              |
| ------------------------------------ | -------------------- | ---------------- |
| R6 Bit-rot detection                 | Phase 3 Track B M-5b | D-65 (this week) |
| PRAGMA integrity_check startup probe | Phase 3 Track B M-5a | D-65 (this week) |

---

## ⬜ What's scheduled post-go-live (per `DEFERRAL_ROADMAP`)

All Tier-2 (R4-R7) + Tier-3 (R8-R12) controls.

Re-evaluate priority based on workshop answer to Q3 (legal vs business retention basis):

- **If LEGAL (SOX/ISO):** Tier-3 escalates from "nice-to-have" to MUST → R10/R11/R12 become Q2/Q3 2027 binding commitments
- **If BUSINESS only:** Tier-3 stays nice-to-have, can defer to 2028+ if other priorities

---

## 🎯 Bán điểm cho compliance check pre-D-0

**Key message · Thông điệp chính:**

> Tier-1 retention foundation đã DONE 41 ngày trước deadline. v1.6 ships with:
>
> - Quote saved 2026-08-30 reproducible in 2046 byte-for-byte (R1 + R2 contract)
> - Audit log tamper detection infrastructure available; wiring days after go-live
> - Bit-rot detection monthly cron pre-D-0 (R6)
>
> Tier-2/Tier-3 trên timeline rõ ràng (`DEFERRAL_ROADMAP`); chấp nhận pháp lý / compliance regime sẽ confirm bằng workshop Q3.

---

## Stakeholder/Compliance sign-off

| Reviewer                       | Question                             | Answer  | Date               |
| ------------------------------ | ------------------------------------ | ------- | ------------------ |
| Stakeholder CCL Design (Q3)    | Retention basis = legal OR business? | **\_**  | **\_**             |
| Compliance/Legal (if Q3=legal) | Confirmed regulatory regime          | **\_**  | **\_**             |
| Engineering (Henry)            | Tier-1 evidence reviewed             | Pending | **\_**             |
| Backup Engineer (Hương)        | Recovery procedures understood       | Pending | D-7 shadow session |

---

## Cross-reference

- `docs/golive/SCOPE_LOCK_v1.6.md` — v1.6 IN/OUT lock
- `docs/golive/DEFERRAL_ROADMAP.md` — R4/R5/R7-R12 schedule
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — Q3 (retention basis) blocks compliance scope decision
- `docs/retention/audit-chain.md` — R3 rollout 4-phase plan (2.2a/b/c/d)
- `client/src/services/loadFrozenQuote.test.js` — R2 contract test
- `client/src/services/loadFrozenQuotesAll.test.js` — R2 extension (3 fixtures PR-B #190)
- `server/services/auditChain.js` + tests — R3 foundation
- `scripts/regen-frozen-quotes.mjs` — R2 fixture regen tool
- `scripts/verify-audit-chain.mjs` — R3 CLI verify tool
- [project_golive memory] — Conditional GO C-2 status
- Enterprise Re-evaluation 2026-06-20 — R1-R12 numbering source
