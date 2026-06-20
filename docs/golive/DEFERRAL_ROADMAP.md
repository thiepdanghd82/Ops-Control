# DEFERRAL ROADMAP — v1.6 OUT-of-scope items

## Lộ trình các hạng mục dời ra ngoài v1.6 (không bỏ — chỉ dời)

**Purpose · Mục đích:** Trấn an stakeholder: các yêu cầu OUT khỏi v1.6 KHÔNG bị hủy — có lịch cụ thể với điều kiện kích hoạt rõ ràng.
**Companion:** `SCOPE_LOCK_v1.6.md`
**Last updated:** 2026-06-20

---

## Timeline Overview

```
2026  │ JUN │ JUL │ AUG │ SEP │ OCT │ NOV │ DEC │
      │  •  │     │ D-0 │ +30 │     │ ★   │     │ ← S-WIN-PORT start
                          │           │
                          │           └─ Hypercare end + Win port begins

2027  │ Q1     │ Q2     │ Q3     │ Q4     │
      │ ★      │ ★      │ ★      │        │
        │        │
        │        └─ S-HYBRID-CLOUD impl + R10-R12 retention
        │           + M-2 SAP integration impl
        └─ S-WEB-FIRST + M-2 SAP feasibility study + R8 escape hatch
```

---

## 📅 By Quarter

### 🟢 2026 Q4 — Post-Hypercare (D+30 → 2026-12-31)

#### **S-WIN-PORT** (Windows v1.6 port)

- **Start:** D+30 (2026-09-29, end of Hypercare)
- **Duration:** ~2 sprints
- **Trigger:** Hypercare exits clean (no P0 hotfix in last 14 days)
- **Acceptance:**
  - Win SERVER + CLIENT DMG build green via existing `desktop:build:win` script
  - Full hardware smoke matrix Win 10 + Win 11 + Windows Server
  - In-place upgrade v1.5.12 → v1.6 tested on copy of prod Win install
  - `deploy.ps1` updates verified end-to-end
- **Owner:** Henry + Hương
- **Risk if delayed:** Windows operators (if any) stuck on v1.5.12 — no S-EXPORT-MVP-2 HMAC, no Pricing Snapshot, no new die-cut types

#### **R4 Tiered archival (HOT/WARM/COLD)** — Retention control

- **Start:** 2026-11 (after S-WIN-PORT)
- **Acceptance:**
  - HOT tier: SQLite quotes ≤ 2 years (live query path)
  - WARM tier: 2-5 years → JSON snapshot + manifest in archival folder
  - COLD tier: 5-20 years → Parquet + manifest + sha256 integrity files
  - Annual restore-drill procedure documented (R5)
- **Depends on:** retention scope clarified at C-1 workshop Q3

#### **R5 Annual restore-drill from COLD tier** — Retention control

- **Cadence:** January 1 each year
- **Procedure:** sample 10 random quotes from COLD tier → restore via R4 reader → verify reproducibility (uses `loadFrozenQuote` test pattern)
- **Owner:** Hương (post-onboarding)

#### **R6 Bit-rot detection** — Retention control (Phase 3 M-5b)

- **Status:** Will be implemented under Phase 3 Track B (this week's Track B PR)
- **Cron:** Monthly sha256 walk over quote rows > 30 days; alert on drift

---

### 🟡 2027 Q1 (Jan-Mar)

#### **S-WEB-FIRST** (true web-first refactor)

- **Start:** 2027-01
- **Duration:** ~4-6 sprints
- **Trigger:** S-WIN-PORT stable + stakeholder confirms web demand
- **Acceptance:**
  - Refactor Electron-only IPC sentinels (`__probe__`, `__firstrun__`) to support both Electron + browser
  - CSRF + cookie SameSite + auth flow audited cross-origin
  - FileSystem Access API fallback verified Chrome/Edge/Safari
  - Browser print/PDF stylesheet polish
  - Operator workflow research: which workflows web vs desktop, who uses what
- **Depends on:** stakeholder confirm value of web access for remote sales/management

#### **M-2 SAP CO-PC feasibility study**

- **Type:** Investigation/design
- **Owner:** Henry + CCL Design IT
- **Outputs:**
  - Read-only sync direction (IFS Inventory pull + Rate table pull)
  - Bidirectional decision (approved quote → SAP sales order push?)
  - Auth model (service account vs OAuth)
  - Failure mode handling (SAP down, sync conflict, etc.)
- **Decision point:** Q1-end → impl OR deprecate Ops Control in favor of SAP-native CO-PC module

#### **R8 "if better-sqlite3 abandoned" escape hatch** — Retention control

- **Type:** Documented procedure + tooling
- **Output:** dump tool to CSV+JSON-LD; documented restore from non-SQLite source
- **Trigger if:** better-sqlite3 maintainer abandons project; alternative DB needed

#### **MES-3-FIX-56** Cpx SubProductRow dedup (~1,600 LOC)

- **Type:** internal refactor, no UI change
- **Owner:** Henry
- **Acceptance:** golden 128/128 unchanged; bundle delta ≤0; UI byte-identical via hardware verify

---

### 🟠 2027 Q2 (Apr-Jun)

#### **S-HYBRID-CLOUD** (cloud component, if scoped at workshop)

- **Start:** 2027-04 (only if Q2 answer = "cloud reporting OR cloud web access")
- **Duration:** ~6-8 sprints
- **Options** (depends on workshop Q2):
  - Option B: Centralized cloud reporting (BI dashboard from multi-site SQLite)
  - Option C: Cloud-hosted Web access for remote sales (operator off-site quote review)
  - Option D (full SaaS multi-tenant): NO-GO — would require full rewrite
- **Depends on:** S-WIN-PORT + S-WEB-FIRST done; multi-site rollout active

#### **R10 Auditor read-only export tool** — Retention control

- **Output:** CLI tool: `RFQ-2027-XXXX → 1 PDF with all historical pricing snapshots from save → present`
- **For:** SOX-style auditor reviewing margin reconciliation across years
- **Depends on:** R4 tiered archival done

#### **R11 Legal hold flag** — Retention control

- **Schema:** add `legal_hold: boolean` to quote → prevents deletion even by sys role
- **Use case:** litigation discovery — preserve evidence
- **Owner:** Henry

---

### 🔵 2027 Q3 (Jul-Sep)

#### **R12 RFC 3161 cryptographic timestamping** — Retention control

- **Cadence:** monthly digest of audit_log chain head signed by TSA
- **Provider:** internal or commercial RFC 3161 TSA
- **For:** "audit log was not modified after date X" cryptographic proof

#### **S-AUDIT-CHAIN-CRON** — Phase 2.2d

- **Status:** Filed during Phase 2.2 foundation
- **Output:** Nightly cron + startup probe + pre-rotate-keys gate (per `docs/retention/audit-chain.md` Phase 2.2d)
- **Owner:** Henry + Hương

---

### 🟣 2027 Q4 (Oct-Dec) — Multi-site expansion (CONDITIONAL)

If C-1 workshop confirms multi-site rollout (Q1 = global):

- Bắc Ninh site rollout (~2 sprints)
- License fleet management UI (`feat/license-manager-tab` branch)
- Hot-spare provisioning per site
- Operator training playbook per site

---

## ⚠️ Re-evaluation Triggers

This roadmap MUST be re-reviewed when ANY of the following happens:

1. **Workshop answers shift scope** — re-baseline timeline post C-1
2. **Hypercare exits with P0 hotfix in last 7 days** — slip S-WIN-PORT by 2 weeks
3. **Stakeholder demands ALL platforms in v1.6** — pivot to NO-GO + dời D-0 sang 2027-Q1
4. **Henry not available D-3 → D+14** (R-1 risk) — slip everything, focus Hypercare survival
5. **Hot-spare provisioned + drilled** — unlock parallel rollout pace

---

## Cross-reference

- `SCOPE_LOCK_v1.6.md` — v1.6 IN/OUT lock
- `STAKEHOLDER_QUESTIONS.md` — 7 blocking workshop questions
- `docs/retention/RETENTION_20Y_STRATEGY.md` — 12-control matrix mapping
- Enterprise Re-evaluation 2026-06-20 — source for Re-eval-style numbering (R1-R12)
- [project_golive memory] — Conditional GO C-1 → C-6 checklist
