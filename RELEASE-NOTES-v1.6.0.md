# Ops Control v1.6.0 — Release Notes

**Release date · Ngày phát hành**: 2026-07-21 (planned)
**Tag**: `v1.6.0-rc1` (2026-06-11) → `v1.6.0` (2026-07-21)
**Sprint reference**: S-SNAPSHOT phases 1–6 (Strategy C — pricing snapshot rollout)

---

## 🎯 Critical bug fix (Strategy C)

### Pricing snapshot freeze · Đóng băng giá báo giá

**Problem**: Pre-v1.6, `quote.state` did not embed pricing parameters. `calcEngine` read master `lib.*` at calc time → any old quote re-opened after the master library shifted produced a different cost. Compliance + audit gap for any quote re-opened post-rate-change.

**Trước v1.6**: `quote.state` không chứa tham số định giá. `calcEngine` đọc `lib.*` chính tại thời điểm calc → bất kỳ quote cũ nào mở lại sau khi library chính thay đổi sẽ ra số khác. Gap compliance + audit cho mọi quote mở lại sau khi rate đổi.

**Fix**: Each `Save` now freezes the rows actually used (materials + workcenters + coverage) into `state.pricing_snapshot`. Reload resolves from this snapshot. Library mutations after save DO NOT leak into displayed numbers. Closes the audit/compliance gap end-to-end.

**Sửa**: Mỗi lần `Save` đóng băng các dòng đang dùng (materials + workcenters + coverage) vào `state.pricing_snapshot`. Mở lại resolve từ snapshot. Library đổi sau khi save KHÔNG ảnh hưởng số hiển thị.

### Copy quote silent overwrite · Copy quote ghi đè im lặng

**Problem (latent since Sprint 14)**: `pendingQuote.action='copy'` was set by Quote History right-click → Copy, but never read by either `StandardCalc` nor `ComplexCalc` useEffect. Copies were treated as plain reload → snapshot kept the ORIGINAL `_captured_at`/`_captured_by` → first Save silently overwrote the original RFQ rather than creating a new one.

**Fix**: useEffect now destructures `action`, passes through `loadQuote(quoteType, qState, id, version, action)`. Reducer `LOAD_QUOTE` branches on action — when `'copy'`, calls `copySnapshot()` which flips `_synthesized: true` + clears `_captured_at`/`_captured_by` + resets `activeQuoteId`. Save creates a new RFQ.

### Site mismatch detection · Phát hiện site không khớp

`calcEngine` now emits `result._warnings = [{type: 'site_mismatch', ...}]` when `snapshot._site && state.site && snapshot._site !== state.site`. SnapshotPanel surfaces the warning. xlsx audit sheet captures it. `pricing_snapshot_warning_total{warning="site_mismatch"}` counter aggregates.

---

## ✨ Features

- **SnapshotPanel** — collapsible audit metadata block at bottom of Cost Breakdown (Std + Cpx). Badge tones: 🟢 Frozen / 🟡 Live rates / ⚪ No snapshot.
- **Copy-mode banner** — blue info banner at top of Pricing Worksheet when operator opened a quote via right-click Copy.
- **xlsx export `10 Pricing Snapshot` sheet** — visible audit metadata tab (11 rows). Distinct from hidden `_Audit` (MVP-2 HMAC) sheet.
- **Summarize "Snapshot" column** — optional toggle, default hidden. Renders per-row Frozen/Live/No pill for at-a-glance audit scanning.
- **Scoped filter bar** — Date / Customer / Part / Sale Owner filters shared between Quote History and Cost Breakdown (Sprint S-D21-PRE-GOLIVE PR #111).
- **ColumnsToggle Summarize 32 cols** — operator can hide/show any of the 11 → 32 columns (Sprint S-D20-COLS-TOGGLE-PHASE-1).
- **10 new Summarize cols schema** — `#` / Project / Draw Materials / Quote Materials / Tooling Cost (USD) / Price (VND) + 6 Lead Time & Notice cells (Sprint S-D20-SUMMARIZE-SCHEMA-EXTEND).
- **Price (VND) per-tier** — raw from `state.selling_price_vnd` / `extra_moqs[t-1].price_vnd`, en-US `Intl.NumberFormat` (e.g. `10,450`).
- **Pricing Snapshot operator + admin guides** — bilingual EN+VI under `docs/cutover/PRICING_SNAPSHOT_*_GUIDE.md`.
- **Prometheus metrics** — `pricing_snapshot_save_total{type,source,site}` + `_synth_save_total{type,site}` + `_warning_total{type,warning}` at `/metrics`.

## 🐛 Bug fixes

- `LOAD_QUOTE` silent overwrite via copy action (above).
- Summarize CSV escape for multi-line bullet cells (RFC 4180 — Sprint S-D20-SUMMARIZE-SCHEMA-EXTEND).
- Search scope missing `sale_owner` field (Sprint S-D21-PRE-GOLIVE PR #111).

## ⚙️ Infrastructure

- Pricing-snapshot synthetic benchmark (`scripts/bench/pricingSnapshot.bench.js`) — 100/1k/10k fixtures, p95 budgets enforced.
- UAT script framework (`docs/uat/pricing-snapshot-uat.md`) — 30-scenario bilingual EN+VI (20 operator + 10 admin).
- Production observability via `/metrics` (Prometheus-compat counter families).
- CLAUDE.md sprint-history entries S-SNAPSHOT-PHASE-1..5 with SHAs (Lesson 0 discipline).

## 🔒 Migration · Di trú

- **Additive heal-on-read** — NO schema version bump (PR #110 precedent). Legacy quotes auto-synthesize `pricing_snapshot` on load and on next save the operator's snapshot persists.
- **Backward compatible** — pre-v1.6 quotes open normally. SnapshotPanel shows 🟡 Live rates until operator saves once.
- **5th positional `options` arg** preserves BC across 11 `calcAll` callsites — existing callers continue working unchanged.

## 📊 Performance · Hiệu năng

Bench measured on Mac Apple Silicon (Henry's MacBook), 10k synthetic quotes:

| Operation               | Avg   | p50   | p95       | Budget |
| ----------------------- | ----- | ----- | --------- | ------ |
| `freezeLib`             | 24 μs | 19 μs | **38 μs** | 5 ms   |
| `snapshotPricingParams` | 0 μs  | 0 μs  | **0 μs**  | 2 ms   |
| Resolver lookup         | 0 μs  | 0 μs  | **0 μs**  | 1 ms   |

All p95 latencies are 100–500× under budget. Snapshot work added zero measurable hot-path cost.

## 📦 Sprint references · Tham chiếu sprint

- S-SNAPSHOT-PHASE-1 — Foundation (PR #126, SHA `296da8b`)
- S-SNAPSHOT-PHASE-2 — CalcEngine reader (PR #127, SHA `cb3fa2a`)
- S-SNAPSHOT-PHASE-3 — Writer + render wiring (PR #128, SHA `4ae6931`)
- S-SNAPSHOT-PHASE-4 — UI surface + xlsx audit sheet (PR #129, SHA `d344fd1`)
- S-SNAPSHOT-PHASE-5 — Pre-go-live validation (PR #130, SHA `c336083`)
- S-SNAPSHOT-PHASE-6 — Deploy + go-live (this sprint)

## ⚠ Known issues · Vấn đề đã biết

- 3 chunks slightly over Sprint 24 perf budget: `index` +24KB / `HelpTab` +16.7KB / `CalcContext` +0.8KB. Info-only — `check-perf-budget.js` is not a CI hard gate. v1.6.1 patch list candidate.
- Pre-existing CI red checks (Lint + Commit messages) per MES-3-FIX-38 + MES-3-FIX-50 backlog. Green checks: client tests / server tests / router siblings / runtime deps / vulnerability scan / commit-msg hook.

## 📅 Rollout schedule · Lịch triển khai

| Date                     | Event                                                 |
| ------------------------ | ----------------------------------------------------- |
| 2026-06-11               | Day 1.A — pre-flight + tag v1.6.0-rc1                 |
| 2026-06-12               | Day 2 — build DMG SERVER + CLIENT (ad-hoc signed)     |
| 2026-06-15/16            | Day 3-4 — Henry solo hardware verify (6 scenarios)    |
| 2026-06-17               | Day 5 — buffer (rollback drill skipped per Q4=C)      |
| 2026-06-18/19            | Day 6-7 — bilingual guides + cheatsheet finalised     |
| 2026-06-20 — 2026-07-17  | Buffer / bug fix cycle / dry-run sessions             |
| **2026-07-18 22:00 ICT** | **Production cut-over (Sat off-shift)**               |
| 2026-07-19/20            | 48h close monitoring (Henry on-call)                  |
| **2026-07-21 09:00 ICT** | **GO-LIVE official + operator training session 1–2h** |

---

**Compiled · Biên soạn**: Henry · Henry@CCL Vietnam · 2026-06-10
