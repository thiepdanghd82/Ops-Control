# C-4 HOT-SPARE PROCUREMENT — Mac mini purchase note

## Hot-spare Mac mini for SERVER role · Mac mini dự phòng cho SERVER

**Procurement deadline · Hạn mua**: 2026-07-10 (allow 14-day ship + 7-day provision before D-30 = 2026-07-31)
**Estimated cost · Chi phí ước**: ~$700 USD (Mac mini M4 base + accessories)
**Justification · Cơ sở**: Eliminates SPOF on Henry's SERVER Mac mini for v1.6 go-live; required to run C-4 backup drill (`C4_DRILL_RUNBOOK.md`) and post-go-live BCP/RTO ≤ 6h
**Approver · Người duyệt**: Henry → Henry's manager (sign off for company purchase)

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
