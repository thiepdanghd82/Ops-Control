# C-1 STAKEHOLDER QUESTIONS — 7 blocking decisions

## 7 câu hỏi blocking cần trả lời tại/trước workshop scope-lock

**Workshop deadline · Hạn workshop:** 2026-06-26 (D-65) — **6 ngày nữa**
**Purpose · Mục đích:** không có câu trả lời cho 7 câu này = scope-lock không thể ký = rủi ro disagreement debacle tại D-7 training (2026-08-23)
**Format:** mỗi câu có 3 phần — _Why ask (Lý do hỏi)_, _Options (Lựa chọn)_, _Impact on scope (Tác động scope)_

---

## Q1. CCL Design = Hai Duong only OR multi-site global?

**🇬🇧 EN:** Is "CCL Design" referring to (a) the single Hai Duong site pilot OR (b) a global CCL corporate entity with multiple sites (Vietnam + Indonesia + Thailand + global brand accounts)?

**🇻🇳 VI:** "CCL Design" trong scope này chỉ (a) duy nhất site Hai Duong (pilot) HAY (b) tập đoàn CCL toàn cầu nhiều site?

### Why ask

Memory `project_golive.md` originally said "CCL Vietnam Hai Duong". The Re-evaluation prompt 2026-06-20 said "CCL Design". This may be a rename OR a scope expansion. Impacts SAP integration priority + license fleet + rollout wave.

### Options

- (a) **Hai Duong-only pilot** → multi-site is OUT of v1.6, future rollout sprint(s) sau go-live ổn định
- (b) **CCL Design global** → multi-site IN scope for roadmap; SAP integration M-2 ESCALATES to P1 (avoid shadow-IT divergence); license fleet management UI ESCALATES from `feat/license-manager-tab` branch backlog

### Impact on scope

- (a) preserves current `SCOPE_LOCK_v1.6.md` Mac-only pilot
- (b) forces re-baseline of timeline: D-0 stays 2026-08-30 for pilot, but Q4 2026 must include S-WIN-PORT + multi-site rollout planning. NOT a code change to v1.6 itself, but commits Henry to specific roadmap dates

### Recommended answer

(a) for v1.6; (b) deferred to expansion roadmap. Use pilot to derisk before scaling.

---

## Q2. "Hybrid" definition — what does stakeholder mean?

**🇬🇧 EN:** "Hybrid (on-prem + cloud)" in the prompt context: which of these matches stakeholder intent?

- A. Off-site backup tới cloud storage (S3/Azure Blob) for DR — **already in scope** via rsync
- B. Centralized cloud reporting layer (BI dashboard from multi-site SQLite)
- C. Cloud-hosted Web access for remote sales (operator off-site quote review)
- D. Full SaaS multi-tenant (rewrite)

**🇻🇳 VI:** "Hybrid (on-prem + cloud)" stakeholder muốn cụ thể là gì?

- A. Backup off-site cloud (DR) — đã trong scope
- B. Cloud reporting tập trung (BI dashboard)
- C. Web access cloud cho sales từ xa
- D. SaaS multi-tenant đầy đủ (rewrite)

### Why ask

Stakeholder phrasing "Hybrid" is ambiguous. Henry's interpretation matters because:

- (A) is already done — no new work
- (B) is XL scope, Q2 2027 earliest
- (C) is M scope (S-WEB-FIRST prerequisite)
- (D) is NO-GO for v1.6 (full rewrite)

### Options + Impact

- A → confirm in `DEFERRAL_ROADMAP` that backup rsync = Hybrid for v1.6
- B → file S-HYBRID-BI ticket, Q2 2027 estimate
- C → escalates S-WEB-FIRST priority to Q1 2027 (was tentative)
- D → counter-propose: dời go-live, no path in 10 weeks

### Recommended answer

A (already in scope). If stakeholder needs B/C, defer to roadmap with stakeholder commitment to Q4 2026 design + Q2 2027 ship.

---

## Q3. "20-year retention" — legal/compliance OR business requirement?

**🇬🇧 EN:** Is 20-year retention driven by (a) regulation (SOX, GDPR, ISO 27001 audit, Vietnam Nghị định 13/2023) OR (b) business requirement (master-supplier agreement reference cycle)?

**🇻🇳 VI:** Yêu cầu lưu trữ 20 năm là vì (a) pháp lý (SOX, GDPR, ISO 27001, Nghị định 13/2023 VN) HAY (b) business (chu kỳ tham chiếu master-supplier agreement)?

### Why ask

Difference is which 12 controls (R1-R12 in `RETENTION_20Y_STRATEGY.md`) are pre-go-live MUST vs nice-to-have:

- (a) Legal → R1-R3 (Tier-1) + R10-R12 (Tier-3 forensic) MANDATORY; auditor will demand evidence
- (b) Business → R1-R3 sufficient; R10-R12 nice-to-have, defer indefinitely

### Options + Impact

- (a) Legal → escalate R11 (legal hold) + R12 (RFC 3161 timestamping) into 2027 roadmap as P1 commitments
- (b) Business → keep current R8-R12 = 2027 Q1-Q3 estimates
- Combination (both) → cumulative impact = (a) holds

### Recommended answer

Confirm regulatory regime CCL Design operates under. If SOX-equivalent (US-listed parent company), MUST be (a). If purely Vietnam private business, (b) sufficient.

---

## Q4. "15 user" — concurrent / total provisioned / named with shift turnover?

**🇬🇧 EN:** "15 users" = (a) 15 concurrent at peak; (b) 15 total provisioned (typical peak 5-7 concurrent); (c) 15 named but shift turnover means ~45 named accounts across 3 shifts/day?

**🇻🇳 VI:** "15 user" = (a) 15 đồng thời tại peak; (b) 15 tổng provisioned (peak điển hình 5-7 đồng thời); (c) 15 named nhưng có shift turnover (3 ca/ngày = ~45 named accounts)?

### Why ask

- (a) → current architecture comfortable (no scaling concern)
- (b) → comfortable margin, no scaling needed
- (c) → impacts auth audit attribution (who quoted what?) + license fleet capacity + provisioning card workflow scale

### Recommended answer

Confirm with HR org chart. Costing role typically (a) or (b); MES kiosk would be (c) but kiosk is OUT of v1.6.

---

## Q5. Tech stack — confirm or revise before v1.6?

**🇬🇧 EN:** Confirm current stack for v1.6:

- Frontend: React 19 + Vite 8 + Electron 41
- Backend: Node.js + Express 4 + better-sqlite3 12
- Auth: argon2 + bcryptjs + TOTP
- Build: husky + lint-staged + commitlint

Any intent to change before v1.6 ship? (Replace SQLite with Postgres? Replace Electron with Tauri? etc.)

**🇻🇳 VI:** Confirm tech stack hiện tại cho v1.6 (xem chi tiết trên). Có ý đổi gì trước v1.6 ship không?

### Why ask

Stack change pre-D-0 = D-71 not feasible. Would need to dời go-live.

### Recommended answer

No change. Current stack is production-validated through Phase 1-5 pricing snapshot rollout. Stack evolution → 2027 roadmap items (e.g. Postgres if multi-site demands cross-site joins).

---

## Q6. Integration scope — what's IN before D-0 vs documented for 2027?

**🇬🇧 EN:** Real-world integration scope:

- SAP / ERP — IN or OUT?
- Printer integration (xlsx → printer queue, ZPL labels)?
- Scale / barcode / RFID — IN or OUT?
- Customer email automation?

**🇻🇳 VI:** Phạm vi tích hợp thực tế:

- SAP / ERP — TRONG hay NGOÀI?
- Máy in (xlsx → printer queue, ZPL labels)?
- Cân / barcode / RFID — TRONG hay NGOÀI?
- Email tự động cho customer?

### Why ask

Per Re-evaluation M-3: 0 integration today. Operator manually exports xlsx + emails customer. Stakeholder may have assumed "of course xlsx auto-emails to customer" or similar — clarify NO assumption.

### Options

- ALL OUT for v1.6 → confirm xlsx download → manual operator handling. Document in operator cheatsheet
- SAP IN → counter-propose dời go-live (XL scope)
- Printer ZPL IN → file S-ZEBRA-INTEGRATION (~2 sprints, P2 post-go-live unless critical)

### Recommended answer

ALL OUT for v1.6. Document explicit operator workflow ("Click Export → save xlsx → email customer manually").

---

## Q7. Mac-only scope — acceptable for v1.6 pilot?

**🇬🇧 EN:** Confirm: stakeholder accepts that v1.6 ships **Mac only** (Win deferred to Q4 2026)?

**🇻🇳 VI:** Confirm: stakeholder chấp nhận v1.6 ship **chỉ Mac** (Windows dời tới Q4 2026)?

### Why ask

This is the GATE for the entire scope-lock. If stakeholder INSISTS Mac + Win same release, S-WIN-PORT bundles into v1.6 → ~2 sprints additional → D-0 slips to 2026-09-15 minimum, or accept reduced Mac scope to make room.

### Options

- (a) Yes — Mac only for v1.6, Win Q4 2026 → preserves current plan
- (b) No — must include Win → counter-propose D-0 slip to mid-Sep
- (c) Mac + read-only Web for managers — compromise → S-WEB-FIRST simplified Q3 2026, but adds risk to D-0

### Recommended answer

(a). Pilot one site one OS to derisk. Multi-OS comes with multi-site (2027).

---

## 🎯 Workshop execution outline (suggested)

| Time      | Item                                                                 | Output                                       |
| --------- | -------------------------------------------------------------------- | -------------------------------------------- |
| 0:00-0:15 | Opening + scope-lock context (read SCOPE_LOCK_v1.6.md IN/OUT matrix) | Stakeholder understands proposal             |
| 0:15-0:45 | Q1-Q3 (CCL scope + Hybrid + 20-year basis)                           | 3 binding decisions                          |
| 0:45-1:15 | Q4-Q6 (users + tech + integration)                                   | 3 confirmations                              |
| 1:15-1:30 | Q7 (Mac-only acceptance) — THE GATE                                  | YES/NO decision                              |
| 1:30-1:45 | DEFERRAL_ROADMAP walkthrough                                         | Stakeholder sees "not cancelled, just dated" |
| 1:45-2:30 | Open Q&A + edge cases                                                | Surface hidden assumptions                   |
| 2:30-3:00 | Sign SCOPE_LOCK_v1.6.md                                              | Workshop closes with signature               |

**Total: ~3 hours** (could be 2 if stakeholder is decisive)

---

## ⚠️ If workshop cannot happen before 2026-06-26

- Henry escalates to async sign-off: send all 3 docs (SCOPE_LOCK + DEFERRAL_ROADMAP + STAKEHOLDER_QUESTIONS) via email with 48h response deadline
- If no response: file `S-SCOPE-LOCK-PENDING` blocking ticket; pause Phase 3+ work until scope clear
- Document escalation in `project_golive` memory with date + action taken

---

## Cross-reference

- `SCOPE_LOCK_v1.6.md` — document being signed
- `DEFERRAL_ROADMAP.md` — what OUT items become
- `docs/retention/RETENTION_20Y_STRATEGY.md` — 12-control matrix (relevant to Q3)
- [project_golive memory] — Conditional GO C-1 deadline tracking
