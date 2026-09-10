# C-4 HOT-SPARE PROCUREMENT — Mac mini purchase note

## 🛑 DECISION (2026-06-21) — Henry: NO PURCHASE · Henry quyết: KHÔNG MUA

> **EN:** Henry has decided NOT to procure a hot-spare Mac mini for v1.6 go-live. This document is preserved as historical reference + risk record. The C-4 backup drill (`C4_DRILL_RUNBOOK.md`) shifts to a **restore-only drill** (no failover rehearsal) and the operational BCP **accepts the elevated RTO**.
>
> **VI:** Henry đã quyết định KHÔNG mua hot-spare Mac mini cho v1.6 go-live. Tài liệu này giữ làm tham chiếu lịch sử + ghi nhận rủi ro. C-4 drill chuyển sang **chỉ restore** (không diễn tập failover) và BCP vận hành **chấp nhận RTO cao hơn**.

### 🚨 RTO impact accepted · Tác động RTO chấp nhận

| Scenario                | With hot-spare (rejected) | Without hot-spare (current decision)                   |
| ----------------------- | ------------------------- | ------------------------------------------------------ |
| Disk failure            | ~6h RTO (swap + restore)  | **~14-22 days** (procure + ship + provision + restore) |
| Mac stolen / fried      | ~6h RTO                   | **~14-22 days**                                        |
| OS bricked / corruption | ~4h (reinstall on spare)  | ~2-3 days (rebuild on existing Mac OR loaner)          |
| BCP risk classification | Yellow                    | **Orange** — production downtime up to 3 weeks         |
| RPO (data loss bound)   | 24h (nightly backup)      | 24h (unchanged — backup discipline same)               |

**Mitigation now required** (work to schedule into C-4 drill day):

1. **Fast-ship pre-arrangement** — identify local Hai Duong / Hanoi Apple reseller able to ship Mac mini same-day or next-day during business hours. Worst-case RTO drops to ~3-5 days instead of 14-22. Henry to confirm vendor + capture phone+address before D-7 (2026-08-23).
2. **Loaner Mac inventory** — if any Mac in Hai Duong office (any department) can be temporarily commandeered as emergency SERVER for ≤72h, document the loaner candidate + escalation contact. Even Henry's personal Mac counts in true emergency.
3. **Operator workaround SOP** — if SERVER down >24h, document fallback to xlsx-only quote workflow (operators paste lib values from last printed price list, generate quote in Excel, re-enter into Ops Control when service restored). Loses snapshot freezing for affected quotes but keeps business running.
4. **Faster off-site backup cadence** — consider tightening rsync from nightly to every 6h to bound RPO further during the no-hotspare risk window.

**Rationale for no-purchase**: Henry's call (not captured here — budget? availability? acceptable risk for pilot?). Document does NOT advocate the decision; documents the consequences so the trade-off is on record for retro + future revision (e.g. v1.6.1 if disk failure event happens).

---

## Original procurement plan (HISTORICAL — NOT to execute)

> Below preserved for context. SKIP to `C4_DRILL_RUNBOOK.md` for the revised drill scope under no-hotspare BCP.

**Procurement deadline · Hạn mua**: ~~2026-07-10~~ — CANCELLED
**Estimated cost · Chi phí ước**: ~~$700-830 USD~~ — not approved
**Justification · Cơ sở**: ~~Eliminates SPOF; enables ~6h RTO~~ — risk accepted per decision above
**Approver · Người duyệt**: ~~Henry → Henry's manager~~ — decision: NO

---

## 🎯 Why hot-spare is required · Tại sao cần hot-spare

**Today's risk · Rủi ro hiện tại**:

- 1 SERVER Mac mini running the embedded Express + SQLite at CCL Design Hai Duong
- If disk fails / OS bricks / Mac is stolen / power surge fries motherboard → **production stops immediately**
- Restore-from-backup requires: provisioning new Mac mini (~14 day ship), reinstalling app + config (4-6h), restoring SQLite + Library (1-2h)
- **Realistic RTO without hot-spare: 18-22 days** during ship time
- **With hot-spare (pre-provisioned)**: ~6 hours (swap + restore from off-site rsync)

**Memory project_golive states**: "C-4 Backup integrity drill — PENDING (Hương)" — drill assumes a hot-spare exists. Without it, the drill is theoretical only.

**Per Re-evaluation 2026-06-20**: B-3 (SPOF Henry) reduction is a Hypercare-period priority. Hot-spare is half of that solution (the other half is Hương ops knowledge transfer per `C4_DRILL_RUNBOOK.md`).

---

## 💰 Cost breakdown · Cấu trúc chi phí

| Item                                  | Spec                                        | Unit Cost (USD est.) | Vendor / Note                             |
| ------------------------------------- | ------------------------------------------- | -------------------- | ----------------------------------------- |
| Mac mini M4 (base)                    | Apple M4 chip, 16GB RAM, 256GB SSD          | $599                 | Apple Store / authorized Vietnam reseller |
| Power cable + HDMI cable              | Standard accessories                        | $25                  | Apple Store accessory                     |
| External backup drive (optional)      | 1TB USB-C SSD for local snapshot redundancy | $80                  | Samsung T7 or equivalent                  |
| **Subtotal hardware**                 |                                             | **~$700**            |                                           |
| Shipping (Apple → Vietnam, expedited) | 5-7 business days                           | included / +$30      | Confirm at order time                     |
| Apple Care+ (optional, +3 years)      | Hardware warranty extension                 | +$99                 | Strongly recommended for production gear  |
| **Total (with AppleCare)**            |                                             | **~$830**            |                                           |

**Note**: Vietnam Apple retail markup may push to ~$750-800 base. Confirm with reseller before ordering.

---

## 📋 Specification rationale · Lý do chọn spec

| Spec         | Choice                       | Why                                                                                                                                 |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Chip         | Apple M4 (NOT M2 or older)   | Matches current SERVER's Apple Silicon arch; better-sqlite3 builds + Electron 41 tested on M-series; future-proof through 2028+     |
| RAM          | 16GB (NOT 8GB)               | Embedded Express + SQLite + Electron stack uses ~3-4GB; 8GB tight under bulk export load                                            |
| Storage      | 256GB (sufficient)           | App + bundled assets ~1GB; SQLite DB after 5y operation ~5GB; Library/\* ~50MB; backups offline. 256GB plenty. Don't pay for 512GB. |
| OS           | macOS Sequoia 15.x (current) | Matches dev environment; no special config needed                                                                                   |
| External SSD | 1TB USB-C (optional)         | Local snapshot redundancy in case off-site rsync target unreachable; nice-to-have, defer if budget tight                            |

---

## 🛒 Procurement process · Quy trình mua

### Step 1: Henry assembles purchase request (today, 2026-06-20)

- [ ] Confirm budget availability with Henry's manager (~$700-830)
- [ ] Get vendor quote (Apple authorized reseller in Hai Duong / Hanoi)
- [ ] Confirm 14-day ship feasibility
- [ ] Justification memo: cite this doc + `project_golive` C-4 + B-3 SPOF reduction

### Step 2: Approval (target 2026-06-25, within 5 days)

- [ ] Henry's manager signs off purchase order
- [ ] Finance issues PO to vendor
- [ ] Confirm payment terms + shipping address (CCL Design Hai Duong office)

### Step 3: Order placement (target 2026-06-27)

- [ ] PO sent to vendor
- [ ] Vendor confirms stock + ship date (target arrival ≤ 2026-07-10)
- [ ] Insurance for shipment (small cost, recommended)

### Step 4: Receipt + provisioning (target 2026-07-15)

- [ ] Mac mini arrives at CCL Design Hai Duong
- [ ] Henry unboxes + setup macOS (admin account, English locale, set Hai Duong timezone)
- [ ] Install Ops Control SERVER DMG (latest v1.6 rc)
- [ ] Configure as SERVER role (Settings → Connection Mode → SERVER + provision admin)
- [ ] Network: assign static IP (proposed: 10.102.3.62 if available; same VLAN as primary SERVER 10.102.3.61)
- [ ] DNS / hosts file entry for `ops-control-hotspare.local`
- [ ] Verify can boot + login + access embedded SQLite

### Step 5: Synchronize from primary (target 2026-07-18)

- [ ] One-time SQLite snapshot copy from primary SERVER
- [ ] Library/\* mirror via rsync
- [ ] Verify hot-spare can serve quotes if primary stops (test offline by stopping primary)
- [ ] Document switchover procedure in `C4_DRILL_RUNBOOK.md`

### Step 6: Drill rehearsal (target 2026-07-25, before D-30 = 2026-07-31)

- [ ] Run full drill per `C4_DRILL_RUNBOOK.md` with Hương operating
- [ ] Time RTO end-to-end (target ≤ 6h cold, ≤ 1h warm-spare)
- [ ] File any issues found into drill runbook; iterate

---

## 🚨 Fallback if procurement slips · Nếu mua chậm

| Slip scenario                    | Fallback                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Approval delayed past 2026-06-30 | Use Henry's personal Mac mini (if available) for drill rehearsal; defer formal hot-spare to v1.6.1                                       |
| Shipping delayed past 2026-07-15 | Drill rehearses on loaner Mac mini from another office / dev machine; defer formal hot-spare                                             |
| Budget rejected entirely         | File `S-BCP-RISK-NO-HOTSPARE` ticket; document elevated risk in `project_golive` memory; recommend D+30 reinvestment from go-live budget |

---

## 📊 Procurement status tracker · Theo dõi mua

| Step                   | Target date | Actual date      | Notes                                                      |
| ---------------------- | ----------- | ---------------- | ---------------------------------------------------------- |
| 1. Purchase request    | 2026-06-20  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| 2. Manager approval    | 2026-06-25  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| 3. Order placed        | 2026-06-27  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| 4. Receipt + provision | 2026-07-15  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| 5. Sync from primary   | 2026-07-18  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |
| 6. Drill rehearsal     | 2026-07-25  | \***\*\_\_\*\*** | **\*\*\*\***\*\***\*\*\*\***\_**\*\*\*\***\*\***\*\*\*\*** |

---

## Cross-reference

- `docs/ops/C4_DRILL_RUNBOOK.md` — backup drill + bit-rot cron deployment runbook (Hương operates, hot-spare is part of the drill)
- [project_golive memory] — C-4 status + B-3 SPOF reduction tracking
- `CLAUDE.md` Recovery playbook — "Bare-metal restore" runbook (assumes hot-spare exists for ~6h RTO)
