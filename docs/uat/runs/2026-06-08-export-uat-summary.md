# UAT D-1 Summary — 2026-06-08 (Go-Live 2026-06-09)

> Scenarios SCN1-8 from `docs/uat/uat-export-flow.md`. Engineer + operator execute joint
> session 08:00-12:00. P0 finding = HALT cutover.

## Session info

- **Date**: 2026-06-08
- **Start time**: `<engineer fills>`
- **End time**: `<engineer fills>`
- **Engineer (executor)**: Đặng Thế Thiệp
- **Operator (verifier)**: `<operator name>`
- **Build under test**: v1.5.10 staging (commit `f33d5c8`)

## Scenarios run

| #    | Scenario                                                                                   | Pass/Fail | Sev if Fail | Notes |
| ---- | ------------------------------------------------------------------------------------------ | --------- | ----------- | ----- |
| SCN1 | Single-tier Std export, internal variant — all rows compute correctly                      | `<P/F>`   |             |       |
| SCN2 | Single-tier Std export, customer variant — Ref Price + Tool Cost hidden, watermark visible | `<P/F>`   |             |       |
| SCN3 | Sheet protection cross-platform — Mac Excel + Win Excel + LibreOffice                      | `<P/F>`   |             |       |
| SCN4 | Quote History Copy→Save — new quote with `(Copy)` suffix, `_version: 0`                    | `<P/F>`   |             |       |
| SCN5 | TOTP enroll + login + 11x bad-code lockout                                                 | `<P/F>`   |             |       |
| SCN6 | Multi-tier zip export — Materials!E5 differs MOQ1 vs MOQ2 (PR #58 fix)                     | `<P/F>`   |             |       |
| SCN7 | Cpx 2-SP × 2-tier — 4 per-SP per-tier matrix sections render                               | `<P/F>`   |             |       |
| SCN8 | Alt-Materials toggle — Std + Cpx + per-tier override; QH badge correct                     | `<P/F>`   |             |       |

## Bugs found (if any)

| Sev | Description | Reproducer | Disposition |
| --- | ----------- | ---------- | ----------- |
|     |             |            |             |

## Ship decision

- [ ] All 8 PASS / P2 only (cosmetic) → **GO**
- [ ] P1 found, mitigation in place → **CONDITIONAL GO** (document mitigation)
- [ ] P0 found → **NO-GO** — escalate to Plant Manager immediately

## Sign-off

- **Lead Engineer**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Date: 2026-06-08
- **QA Operator**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Date: 2026-06-08
- **Plant Manager (informed)**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Date: 2026-06-08

## Companion artifacts

- Test data picker: `docs/uat/test-quotes.md`
- Scenario procedures: `docs/uat/uat-export-flow.md`
- Smoke quote baseline (D-6 work): `docs/uat/smoke-quotes/2026-06-09-baseline.md`
- Feedback template: `docs/uat/feedback-template.md`
- Final readiness checklist (used 17:00 ICT same day): `docs/cutover/D-1_FINAL_CHECKLIST_2026-06-08.md`
- Pre-flight audit (engineer self-check): `docs/cutover/D-1_PREFLIGHT_AUDIT_2026-06-08.md`
- 8-day cutover plan: `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md`
