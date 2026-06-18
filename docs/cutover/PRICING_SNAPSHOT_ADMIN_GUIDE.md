# Pricing Snapshot — Admin Guide · Hướng dẫn Admin

> Audience: Plant Manager, sysadmin, internal auditor.
> Đối tượng: Plant Manager, sysadmin, kiểm toán nội bộ.

## 1. What it does · Tác dụng

Every quote save freezes the rates used at save time into `state.pricing_snapshot`. Reopens resolve from this snapshot — library mutations after save do NOT leak into the displayed numbers. Closes the audit / compliance gap between `quote.result.s_ttl` and what calcEngine would compute today.

Mỗi lần lưu báo giá đóng băng đơn giá dùng lúc lưu vào `state.pricing_snapshot`. Lần mở sau resolve từ snapshot — library đổi sau khi lưu KHÔNG ảnh hưởng lên số hiển thị. Khắc phục gap audit / compliance giữa `quote.result.s_ttl` và phép tính hôm nay.

Behaviour is automatic — no admin opt-in, no feature flag. Default ON since Phase 3 (2026-06-10).

Hành vi tự động — admin không cần bật, không có feature flag. Mặc định ON từ Phase 3 (2026-06-10).

---

## 2. Architecture · Kiến trúc

```
Save flow:
  buildQuoteData
    → freezeLib(lib, state, { userId })  # client-side, captures used rows only
    → state.pricing_snapshot = { _captured_at, _captured_by, _synthesized, _lib_version, _site, materials, coverage, rates }
    → POST /api/quotes
    → server upsertQuote + recordSnapshotSave (metrics)

Reload flow:
  loadQuote
    → migration heal-on-read (safeLeadTime / healPricingSnapshot)
    → snapshotPricingParams(state, lib) → { source, snapshot }
    → calcAll(state, _, lib, _, { snapshot, source }) → result with _warnings
    → render SnapshotPanel + Cost Breakdown numbers from snapshot
```

Snapshot is embedded INSIDE `quote.state` — not a separate row, no schema migration needed (additive heal-on-read pattern per Sprint S-D21-LEADTIME + PR #110).

Snapshot nhúng TRONG `quote.state` — không phải row riêng, không cần schema migration (additive heal-on-read theo Sprint S-D21-LEADTIME + PR #110).

---

## 3. Warnings the system emits · Các cảnh báo

`quote.result._warnings` array carries warnings detected by calcEngine when resolving the snapshot. SnapshotPanel renders them; xlsx export `10 Pricing Snapshot` sheet surfaces them; Prometheus `/metrics` counts them.

### 3.1 `site_mismatch`

**Trigger**: `snapshot._site !== state.site`. E.g. snapshot frozen under `VN`, operator later flips Site to `India` without resaving.

**Severity · Mức độ**: P1 — operator may be sending the customer a quote priced for the wrong factory.

**Resolution · Xử lý**: Tell operator to either revert the site flip OR save (which rebuilds the snapshot under the new site, clearing the warning).

---

## 4. Verifying snapshot health across the org · Kiểm tra trạng thái snapshot toàn org

### 4.1 Summarize tab — Snapshot column

Fastest at-a-glance check. Cost → Cost Breakdown (Summarize) → Columns toggle → enable **Snapshot**. Scan for 🟡 Live rates rows. These are quotes that need to be resaved before being relied upon for compliance.

Cách nhanh nhất. Cost → Cost Breakdown (Summarize) → toggle Columns → bật **Snapshot**. Quét tìm dòng 🟡 Live rates. Những quote này cần lưu lại trước khi tin cậy cho compliance.

### 4.2 xlsx audit sheet · Tab `10 Pricing Snapshot`

Every exported xlsx (variant `internal` AND `customer`) has tab `10 Pricing Snapshot` showing 11 rows of freeze metadata. Audit reviewers can verify the freeze status without opening the app.

Mọi xlsx export (variant `internal` VÀ `customer`) có tab `10 Pricing Snapshot` với 11 dòng metadata freeze. Auditor có thể kiểm tra freeze status mà không mở app.

| Row · Dòng          | Value semantics · Ý nghĩa                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| Quote ID            | quote.id                                                                     |
| Quote saved at      | quote.saved_at (ISO → local time format)                                     |
| Pricing captured at | snapshot.\_captured_at (or `—`)                                              |
| Pricing captured by | snapshot.\_captured_by (or `—`)                                              |
| Site                | snapshot.\_site (or `—`)                                                     |
| Library version     | snapshot.\_lib_version (or `—`)                                              |
| Snapshot status     | `Frozen at save time` / `Live rates (no snapshot persisted)` / `No snapshot` |
| Materials frozen    | count keys in snapshot.materials                                             |
| Workcenters frozen  | count keys in snapshot.rates                                                 |
| Coverage rows       | length of snapshot.coverage array                                            |
| Warnings            | `—` or newline-separated message list                                        |

Distinct from the hidden `_Audit` sheet (MVP-2 forensic — HMAC + payload hash). Both ship with every export.

Khác với tab `_Audit` ẩn (MVP-2 forensic — HMAC + payload hash). Cả hai đều có trong mọi export.

### 4.3 Prometheus metrics endpoint · `/metrics`

Hit `http://<server>:3100/metrics` (or `:3000` on Linux/Windows server installs). Snapshot counters:

```
# TYPE pricing_snapshot_save_total counter
pricing_snapshot_save_total{site="VN",source="persisted",type="standard"} 1234
pricing_snapshot_save_total{site="VN",source="synthesized",type="standard"} 12
pricing_snapshot_save_total{site="India",source="persisted",type="complex"} 56
pricing_snapshot_save_total{site="unknown",source="empty",type="standard"} 3

# TYPE pricing_snapshot_synth_save_total counter
pricing_snapshot_synth_save_total{site="VN",type="standard"} 12

# TYPE pricing_snapshot_warning_total counter
pricing_snapshot_warning_total{type="standard",warning="site_mismatch"} 4
```

Key signals · Tín hiệu cần chú ý:

- `source="synthesized"` count rising = operators saving quotes WITHOUT library loaded (or copy-quote save flow). Usually fine but spike = investigate.
- `pricing_snapshot_synth_save_total > 0` is normal post-copy-save; rising rapidly = library load problem.
- `warning="site_mismatch"` count rising = operators flipping site without resaving. Train them, or audit individual incidents.

---

## 5. Library audit · Kiểm tra library

After mutating master library (e.g. raising a material price), you can confirm OLD quotes are NOT affected by:

Sau khi sửa library (ví dụ tăng giá vật tư), xác nhận quote CŨ không bị ảnh hưởng bằng:

1. Note the OLD `s_ttl` displayed in a known-Frozen quote.
2. Make the library change. Save library.
3. Reload the quote.
4. Compare `s_ttl` — should be IDENTICAL.
5. Open the quote, click Save (no other change), reload.
6. `s_ttl` NOW reflects the new library — captured_at + library version both updated.

Step 4 is the compliance guarantee. Step 5 is how operators opt-in to picking up library updates.

Bước 4 là cam kết compliance. Bước 5 là cách operator opt-in cập nhật library.

---

## 6. Recovery playbook · Recovery playbook

### 6.1 Snapshot data corrupted in a saved quote

**Symptom · Triệu chứng**: SnapshotPanel renders fine but Cost Breakdown numbers are wildly wrong, or app crashes on reload.

**Diagnose · Chẩn đoán**:

```bash
# Read the raw quote JSON
sqlite3 server/data/ops-control.db \
  "SELECT json_extract(state, '$.pricing_snapshot') FROM quote WHERE id = <N>"
```

If `pricing_snapshot` shape is invalid (missing `materials` or `rates` keys, garbled JSON), this is the corruption.

**Fix · Khắc phục**: clear the snapshot block; reload will heal-on-read (mark synthesized); operator saves to refreeze.

```sql
UPDATE quote
SET state = json_set(state, '$.pricing_snapshot', json('{}'))
WHERE id = <N>;
```

Reload the quote → badge will be 🟡 Live rates. Operator saves once → re-frozen.

---

### 6.2 Mass library mutation accidentally + many quotes show stale snapshot

This is the WHOLE POINT — old snapshots SHOULD shield from accidental library mutation. No recovery action needed. If you WANT old quotes to pick up the new rates:

Đây là CHÍNH ĐIỂM của tính năng — snapshot CŨ NÊN che chắn khỏi sửa library đột xuất. Không cần recovery. Nếu MUỐN quote cũ pick up đơn giá mới:

Option A — Per-quote, gradual: operator opens + saves each affected quote.

Option B — Bulk re-freeze (admin-driven, **destructive metadata reset**):

```bash
# Backup first
sqlite3 server/data/ops-control.db ".backup pre-refreeze-$(date +%Y%m%d).db"

# Clear pricing_snapshot from quotes WHERE saved_at < <threshold>
sqlite3 server/data/ops-control.db <<SQL
UPDATE quote
SET state = json_set(state, '$.pricing_snapshot', json('{}'))
WHERE saved_at < '2026-06-01';
SQL
```

Operators open each cleared quote → badge = 🟡 Live rates → save → re-frozen with NEW lib. The captured_at + captured_by then reflect the admin-orchestrated reset.

**Be careful · Cẩn thận**: bulk reset destroys the original captured_at + captured_by audit trail. Document the action in `audit_log` manually before running.

### 6.3 `/metrics` endpoint exposing snapshot counters to public

The Prometheus endpoint is part of the existing `server/index.js` exposure (Sprint 13). If your prod box exposes :3000 to internet, that's a separate access-control issue — `OPS_ALLOW_SAME_ORIGIN` env + nginx ACL govern this. Snapshot counters do NOT contain customer data (only counts + site labels).

`/metrics` là endpoint Prometheus từ Sprint 13. Nếu prod box mở :3000 ra internet → là vấn đề access-control riêng (`OPS_ALLOW_SAME_ORIGIN` + nginx ACL). Snapshot counter KHÔNG chứa data customer (chỉ count + label site).

---

## 7. Going forward · Kế hoạch tiếp theo

- Phase 5 (this work) — pre-go-live UAT, docs, metrics, benchmark. Lands 2026-06-10 → 2026-06-15.
- Phase 6 (post-go-live) — stage rollout → production cut-over → CCL Vietnam Hai Duong go-live 2026-07-30.
- Backlog ticket if needed — MES-3-FIX-48 (xlsx sheet 11-leadtime, parallel surface to `10 Pricing Snapshot`).

---

## 8. Cross-references · Tham chiếu

- Operator guide · Hướng dẫn người dùng: [PRICING_SNAPSHOT_OPERATOR_GUIDE.md](./PRICING_SNAPSHOT_OPERATOR_GUIDE.md)
- UAT script: [../uat/pricing-snapshot-uat.md](../uat/pricing-snapshot-uat.md)
- Benchmark: `scripts/bench/pricingSnapshot.bench.js` (run `node scripts/bench/pricingSnapshot.bench.js`)
- Metrics helper: `server/services/pricingSnapshotMetrics.js`
- Sprint history entries: search CLAUDE.md for `S-SNAPSHOT-PHASE-`

---

**Last updated · Cập nhật cuối**: 2026-06-10 (Phase 5 / S-SNAPSHOT)
