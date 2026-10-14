# UAT Test Data — Quote Selection Guide

5 representative quotes from prod that span the dimensions the
exporter actually cares about: variant column-hiding (Materials, Inks,
Processes), per-row Setup/Run/Total rendering (post-MVP-1.5),
multi-tier zip path, and large-file edge case.

The actual quote IDs are filled in by the operator BEFORE the UAT
session (this file is the picker spec, not the picker output).

**Slot usage in scenarios:**

- **Slot 1** (single-tier Std): SCN1, SCN2, SCN3, SCN4, SCN5 (throwaway), SCN7
- **Slot 2** (multi-tier Std with mixed materials): **optional / engineer's choice** — use for SCN8 alt-materials coverage if `OPS_FEATURE_ALT_MATERIALS=1`
- **Slot 3** (Cpx multi-subproduct, single-tier): **optional / engineer's choice** — for ad-hoc Cpx inspection beyond Slot 4
- **Slot 4** (multi-tier Cpx, matrix-heaviest): SCN8
- **Slot 5** (large worst-case): SCN6

## Safe-query guide

**Owner: Engineer** (NOT operator). Operator picks the 5 quotes by browsing Quote History UI; engineer runs the queries below to verify selections + extract metadata for the slot tables. Engineer hands the filled tables back to operator before UAT day.

Prod data backend is the SQLite file at `server/data/Library/QuoteHistory/quote_history.json` (NOT a relational DB; flat JSON). Two safe ways to inspect without writing:

### Option A — REST (preferred, read-only by HTTP semantics)

From a machine on the LAN:

```bash
# Hit the prod-mounted endpoint as your own session
curl -s -b "ops_session=<your-session-cookie>" \
     http://10.102.3.61:3000/api/shared/quotes \
     | jq '[.[] | {id, label, type, customer: .state.end_cu, moq: .state.moq, tiers: (.state.extra_moqs | length + 1), version: ._version, has_rows: (.result.rows != null or (.result.subproducts != null))}]' \
     | jq '.[:20]'
```

This lists the 20 most recent quotes with the metadata you need to fill the slots below. The `has_rows` field tells you whether the quote is post-MVP-1.5 (true) or legacy `legacy_no_rows` shape (false). For UAT you want `has_rows: true` quotes — legacy ones will hit the 422 path which is a separate negative scenario (not in the 8 happy-path scenarios).

### Option B — File read (slower but offline-friendly)

If the LAN isn't reachable, copy the JSON file via the deploy SSH tunnel:

```bash
ssh user@10.102.3.61 'cat /opt/ops-control/server/data/Library/QuoteHistory/quote_history.json' \
  | jq '[.[] | select(.result != null) | {id, label, type, end_cu: .state.end_cu, moq: .state.moq}] | .[-20:]'
```

DO NOT edit or write back to the file from your local machine — prod owns the canonical copy.

## Anonymisation policy

The test quotes may be sent to customers (Scenario "feedback collection"). If a test quote contains a different customer's name in `state.end_cu`, `state.direct_cu`, or `state.project_name`, the operator MUST:

1. Pick a different quote, OR
2. Use a synthetic copy: open the quote in the calculator, click "Copy", rename the customer fields to "UAT Customer" + a fake RFQ like "UAT-2026-001", save as a NEW quote (gets a fresh ID), and use the new ID for UAT

**Caveat:** Synthetic quotes (`UAT-2026-XXX` prefix) sẽ tạm tồn tại trong PROD database trong suốt UAT window + 30 ngày retention. Nếu có dashboard / report aggregate nào chạy trên all-quotes, có thể bị pollute. Note với BI/reporting team trước UAT day để filter exclude `UAT-2026-` prefix nếu cần.

PII to scrub if synthesizing:

- `state.end_cu` / `state.direct_cu` — customer names
- `state.project_name` / `state.project` — project labels
- `state.rfq_number` — RFQ codes
- `state.npi_owner` / `_owner` fields — internal staff names
- **Any free-text fields** (`notes`, `comments`, `description`) — may contain customer-specific context; scan + redact

NOT in scope to scrub (don't break the math):

- Material codes, ink names, process types — these are library entries, not PII
- IFS codes — product code, not customer-identifying

## The 5 slots

Fill the table below before UAT day. Each slot serves a different scenario.

### Slot 1 — Single-tier Standard (for SCN1, SCN2, SCN3, SCN4, SCN5, SCN7)

The smoke baseline. Pick the most "boring" Std quote — typical Vietnamese label run, 2-4 materials, 4-6 inks (mixed Indigo + non-Indigo), 3-5 processes, single MOQ tier. The kind of quote operators do 80% of the time.

| Field             | Value                                     |
| ----------------- | ----------------------------------------- |
| Quote ID          | `____`                                    |
| Customer / End CU | `____`                                    |
| RFQ number        | `____`                                    |
| `_version`        | `____`                                    |
| MOQ               | `____`                                    |
| Has rows          | true ✓                                    |
| Notes             | (e.g. "typical Indigo single-tier label") |

### Slot 2 — Multi-tier Standard with mixed-set materials (optional, for SCN8 alt-materials path)

Three-MOQ-tier Std quote with extra_moqs populated. If the alt-materials feature flag is on in prod (`OPS_FEATURE_ALT_MATERIALS=1`), prefer a quote with BOTH main + alt material sets populated and `materials_active` set to one of them.

**Skip this slot if alt-materials feature is OFF in prod, or if engineer chooses not to extend SCN8 coverage.**

| Field                     | Value                           |
| ------------------------- | ------------------------------- |
| Quote ID                  | `____`                          |
| Customer / End CU         | `____`                          |
| MOQ tiers (base + extras) | `____` (e.g. 500 / 1000 / 5000) |
| `_version`                | `____`                          |
| materials_active          | `____` (main / alt)             |
| Has alt set populated     | yes / no                        |
| Notes                     |                                 |

### Slot 3 — Complex (multi-subproduct) quote (optional, for ad-hoc Cpx inspection)

A real Cpx quote with ≥ 2 sub-products. Verifies that the export pipeline's Cpx branches (per-SP Materials/Inks/Processes sections on sheets 03/04/05) render correctly. Slot 4 already covers multi-tier Cpx for SCN8; Slot 3 is single-tier Cpx for spot-checking edge cases without the matrix complexity.

**Skip this slot unless engineer wants ad-hoc Cpx single-tier inspection beyond Slot 4 coverage.**

| Field                  | Value  |
| ---------------------- | ------ |
| Quote ID               | `____` |
| Customer / End CU      | `____` |
| Number of sub-products | `____` |
| `_version`             | `____` |
| MOQ tiers              | `____` |
| Has subproducts.rows   | yes ✓  |
| Notes                  |        |

### Slot 4 — Multi-tier Cpx (for SCN8 — the matrix-heaviest case)

The hardest case for the modal: pick variant × language × tier subset. Cpx + ≥ 3 tiers + ≥ 2 sub-products = the matrix combinatorics that exercises every branch of the pipeline.

| Field                                                                  | Value  |
| ---------------------------------------------------------------------- | ------ |
| Quote ID                                                               | `____` |
| Customer / End CU                                                      | `____` |
| Sub-products                                                           | `____` |
| MOQ tiers                                                              | `____` |
| `_version`                                                             | `____` |
| Has full result.subproducts[].rows + result.subproducts[].tiers[].rows | yes ✓  |
| Notes                                                                  |        |

### Slot 5 — Large / worst-case (for SCN6)

The biggest quote in the system. High sub-product count × high ink/process row count × max MOQ tier count. The export pipeline allocates O(tiers × subproducts × rows) cells — this slot finds the practical ceiling.

| Field                           | Value                                                                       |
| ------------------------------- | --------------------------------------------------------------------------- |
| Quote ID                        | `____`                                                                      |
| Customer / End CU               | `____`                                                                      |
| Sub-products                    | `____`                                                                      |
| Total ink rows (across all SPs) | `____`                                                                      |
| Total process rows              | `____`                                                                      |
| MOQ tiers                       | `____`                                                                      |
| Estimated cell count            | tiers × subproducts × (mat_rows + ink_rows + proc_rows) × ~20 cols ≈ `____` |
| Notes                           |                                                                             |

## Smoke test before customer-share

Before sending ANY exported file to a customer, run this short check:

1. Re-export the same quote → file size should be deterministic ± 1 KB (xlsx-zip compression non-determinism is normal at the byte level)
2. Open the exported file → confirm Cover sheet "Generated on" timestamp matches export wallclock ± 10 s
3. Confirm watermark presence matches the variant picked (Customer = yes, Internal = no)
4. Cross-check Summary sheet KPIs against the Quote History row's **SP / GM% / VA% / Contr%** — must match exactly
5. Spot-check a Materials per-row Setup cost against the same row in PricingBreakdown — must match (this is the MVP-1.5 invariant)

If any of (1)-(5) fails, halt the customer-share and file a P0 bug.

## Post-UAT cleanup

If synthetic quotes were created (per anonymisation), the operator should:

- Move them to Trash (Quote History → Move to Trash) once UAT is closed
- Note their IDs in the post-UAT summary under sprint history `S-EXPORT-UAT` in CLAUDE.md, format: `SYNTHETIC-QUOTES: <id1>, <id2>, ...`
- Do NOT purge — keep them recoverable for ≥ 30 days as the UAT forensic trail
