# SCOPE LOCK — Ops Control v1.6 Go-Live · CCL Design Hai Duong

## v1.6 Go-Live Scope Lock Agreement — Khóa phạm vi go-live v1.6

**Document version:** 1.0 (draft for stakeholder signature)
**Workshop deadline · Hạn workshop:** 2026-06-26 (D-65)
**Go-live date · Ngày go-live:** **2026-08-30 (D-0)**
**Site · Địa điểm:** CCL Design **Hai Duong**, Vietnam
**Owner · Chủ trì:** Henry Đặng Thế Thiệp (Lead Engineer)

---

## 🔒 LOCKED DEFINITION · ĐỊNH NGHĨA KHÓA

> **EN:** "v1.6 go-live 2026-08-30 = **Mac SERVER + CLIENT** application for **CCL Design Hai Duong** site only, supporting **15 internal users** (10 sales + 3 NPI + 1 finance + 1 admin estimate — confirm exact split at workshop) for the **costing + quotation + reporting** workflow."
>
> **VI:** "v1.6 go-live ngày 30-08-2026 = ứng dụng **Mac SERVER + CLIENT** cho duy nhất site **CCL Design Hai Duong**, phục vụ **15 user nội bộ** (ước lượng 10 sales + 3 NPI + 1 finance + 1 admin — xác nhận số chính xác tại workshop) cho luồng **tính giá thành + báo giá + báo cáo**."

---

## 📋 IN / OUT MATRIX

### ✅ IN — Trong phạm vi v1.6 D-0

| Component · Cấu phần        | Detail · Chi tiết                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Mac SERVER application**  | Electron 41 desktop app trên Mac mini ở site (1 máy chính + 1 hot-spare nếu được approve M-4)                                             |
| **Mac CLIENT applications** | 6 Mac client trên các workstation sales/NPI/finance                                                                                       |
| **Costing engine**          | calcEngine.js client-side (Materials + Inks + Processes + Packing + Tooling + SGA + die-cut Magnetic/Pinacle/woodie/Rotary/Dieset/NC die) |
| **Quotation workflow**      | Std + Cpx quote types; multi-tier MOQ; approve workflow (Phase 9E.4)                                                                      |
| **Reporting**               | xlsx export (10-sheet workbook); customer + internal variants; HMAC-signed; pricing snapshot embedded                                     |
| **Auth**                    | 3-layer (role + department + permission group); TOTP 2FA; provisioning card flow                                                          |
| **Backup**                  | Nightly SQLite + Library + off-site rsync; verifier; 5-snapshot rollback retention                                                        |
| **i18n**                    | VN primary + EN bilingual labels (operators VN-native; supervisors/auditors may need EN)                                                  |
| **20-year retention**       | Pricing snapshot pins all rate-bearing fields at save time (PR-A/A2 done D-71); audit log hash-chain foundation (#187)                    |
| **Permission groups**       | Sales / NPI / Finance / Admin / Sys default groups                                                                                        |

### ❌ OUT — Không trong phạm vi v1.6 D-0 (xem `DEFERRAL_ROADMAP.md` cho timeline)

| Excluded · Loại trừ                       | Reason · Lý do                                                                                                     | Roadmap                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Windows v1.6 DMG**                      | v1.5.12 Windows DMG kept frozen; rebuild + cross-platform smoke tests would consume Mac hardening time             | S-WIN-PORT → 2026 Q4                                                                                   |
| **Web first-class target**                | Current `:3000` web access exists but not touch-first; Electron-only IPC sentinels; CSRF cross-origin not hardened | S-WEB-FIRST → 2027 Q1                                                                                  |
| **Hybrid cloud component**                | No cloud sync, no centralized reporting, no SaaS layer. Off-site backup rsync ≠ Hybrid in this sense               | S-HYBRID-CLOUD → 2027 Q2-Q3 (depends on definition decision at workshop, see STAKEHOLDER_QUESTIONS Q2) |
| **SAP / ERP integration**                 | 0 LOC today. xlsx export is the only data exchange surface                                                         | M-2 SAP CO-PC feasibility → 2027 Q1                                                                    |
| **iOS / Android mobile apps**             | Tab UI not designed for phone form factor                                                                          | No roadmap (out of scope indefinitely unless business case)                                            |
| **MES Kiosk PWA at Hai Duong**            | Shop-floor work-order kiosk exists (`apps/kiosk/`) but feature-flagged off for v1.6; deferred to MES-3 sprint      | MES-3 → 2027                                                                                           |
| **Multi-site rollout (Bắc Ninh, etc.)**   | v1.6 is single-site pilot. Multi-site requires SAP sync + license fleet                                            | Conditional on workshop answer Q1 (CCL Design = global or single-site)                                 |
| **Customer-variant export approval gate** | Snapshot pin solves data drift; gate is workflow discipline                                                        | S-EXPORT-GATE-APPROVAL → post-go-live (stakeholder decides)                                            |

---

## 🚨 CONDITIONS · ĐIỀU KIỆN

This scope lock IS contingent on the following workshop confirmations (see `STAKEHOLDER_QUESTIONS.md`):

> Cam kết scope khóa này phụ thuộc xác nhận tại workshop (chi tiết `STAKEHOLDER_QUESTIONS.md`):

1. **Q1 confirmed:** CCL Design = Hai Duong-only pilot OR multi-site global rollout? (If global → multi-site is OUT of v1.6 but roadmap escalates)
2. **Q2 confirmed:** "Hybrid" = off-site backup rsync (already in scope) OR cloud component (OUT of v1.6)?
3. **Q3 confirmed:** 20-year retention basis (legal vs business — affects 12-control compliance scope)
4. **Q7 confirmed:** Mac-only pilot acceptance

If any of Q1/Q2/Q3/Q7 answers shift scope significantly, this document MUST be re-negotiated; CURRENT scope-lock void until re-signed.

> Nếu câu trả lời Q1/Q2/Q3/Q7 thay đổi scope đáng kể, văn bản này PHẢI thương lượng lại; scope hiện tại vô hiệu cho tới khi ký lại.

---

## ⚠️ ESCALATION PATH · LỘ TRÌNH LEO THANG

If stakeholder insists ALL platforms (Mac+Win+Web+Hybrid) within D-71 window → **counter-proposal: dời go-live sang 2027-Q1**. Rewriting/re-platforming with 1 engineer in 10 weeks is NOT feasible per engineering capacity assessment.

> Nếu stakeholder yêu cầu CẢ 4 platform trong window D-71 → **đối đề xuất: dời go-live sang Q1-2027**. Rewrite/re-platform với 1 engineer trong 10 tuần là KHÔNG khả thi theo đánh giá năng lực engineering.

---

## ✍️ SIGNATURES · CHỮ KÝ

| Role · Vai trò            | Name · Họ tên                      | Signature · Chữ ký                 | Date · Ngày      |
| ------------------------- | ---------------------------------- | ---------------------------------- | ---------------- |
| Stakeholder CCL Design    | \***\*\*\*\*\***\_\***\*\*\*\*\*** | \***\*\*\*\*\***\_\***\*\*\*\*\*** | \***\*\_\_\*\*** |
| Engineering Lead          | Henry Đặng Thế Thiệp               | \***\*\*\*\*\***\_\***\*\*\*\*\*** | \***\*\_\_\*\*** |
| Backup Engineer (witness) | Hương                              | \***\*\*\*\*\***\_\***\*\*\*\*\*** | \***\*\_\_\*\*** |

---

## Cross-reference

- `docs/golive/DEFERRAL_ROADMAP.md` — timeline for OUT items
- `docs/golive/STAKEHOLDER_QUESTIONS.md` — 7 blocking questions for workshop
- `docs/retention/RETENTION_20Y_STRATEGY.md` — 12-control retention matrix
- [project_golive memory] — Conditional GO checklist (C-1 through C-6)
- Enterprise Re-evaluation 2026-06-20 — Re-eval source establishing this scope
