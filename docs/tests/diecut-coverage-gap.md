# Die-cut Costing Test Coverage Gap Analysis

**Date:** 2026-06-20 • **Phase:** 1.1 of Debug Playbook (post Phase 0 CI Green) • **Owner:** Henry

> Audit của golden test cho die-cut financial calc. Cơ sở: die-cut là chi phí materials/tooling cao nhất per quote tại CCL ngành in nhãn, sai số = misquote tài chính trực tiếp. Phase 0 đã clear chronic CI red; Phase 1 đóng test coverage gap nguy hiểm nhất (R-2 trong Re-evaluation).

## TL;DR

**Existing:** 7 golden test cases trên `client/src/services/calcEngine.golden.test.js` cover RDC Die amortization basic flow. K-aware Gallus (Lessons 16-17) + Magnetic die min gap 1.5mm (Lesson 24) + bleed_mm=0 edge case ĐÃ có tests.

**Real gaps (6):**

1. **0.8 EAU cap factor** — Henry's decision 2026-06-15 baked into code (line 645) nhưng KHÔNG có test pin → silent change risk
2. **Jig amortization formula** — `tool_cost / eauCap` (line 664) NEVER tested; chỉ `RDC Die` tested
3. **Production die types unknown to test fixtures** — `woodie`, `Pinacle die`, `Rotary Die`, `Dieset`, `NC die` (per `NpiPartsList.jsx:80-84` TOOLING_KEYS) — golden test only uses `RDC Die` (which is not in NPI canonical set)
4. **`tool_life_ovr` flag behavior** — operator overrides DDL via `tool_life_ovr=true` + `tool_life=<custom>` — code path lines 650-653, untested
5. **Mixed-die Cpx quote** — multiple SPs each với different `tool_type` — no fixture
6. **Die-type spelling inconsistency** — production "Pinacle die" (1n) vs Legend doc "Pinnacle Die" (2n) vs golden test "RDC Die" — no canonical spelling enforced. New site/operator could type any variant → falls through to default `tool_life=1` → cost explodes 100,000× (silent overspend)

## Code surface inspected

### Primary calc — `client/src/services/calcEngine.js`

**`calcProcess()`** lines 550-695 — tooling logic at lines 638-668:

```
eau = annual_qty × product_lifetime (with eau_ovr override)
eauCap = eau × 0.8                  ← Henry 2026-06-15 spec, line 645

if (tool_cost > 0):
  tlife = tool_life_ovr ? tool_life : getToolLife(lib, tool_type) || tool_life || 1
  ttNorm = tool_type.toLowerCase().replace(/[\s&]/g, '')
  isJig = ttNorm === 'jig' || ttNorm === 'jigfixture'
  if isJig:
    tooling = tlife > eauCap ? tool_cost / eauCap : tool_cost / tlife
  else:
    totalToolPcs = tlife × layout
    tooling = totalToolPcs > eauCap ? tool_cost / eauCap : tool_cost / totalToolPcs
```

**`getToolLife(lib, toolType)`** line 117 — reads `lib.ddl.tool_life[toolType]` (operator-configurable DDL, persisted in `Library/DesignTools/ddl_sites.json` per site).

### Gallus die-cut — `client/src/modules/cost/tabs/DesignTools/presses/gallusEngine.js`

- **`DIE_MIN_GAP_MM`** line 592: `{ rotary_magnetic: 1.5, laser: 0.3, flat: 2.0 }` per Lesson 24
- **`HARD_MIN_GAP_MM`** line 597: alias for `DIE_MIN_GAP_MM.rotary_magnetic` (1.5)
- **`bleed_mm`** default 2mm line 94 (per Lesson 22)
- **`magLayoutWithK()`** line 748 — K-aware lane layout subtracting unusable plate zone

## Coverage status per attribute

| Attribute                                                       | Tests Found | File                                 | Real Gap  | Severity |
| --------------------------------------------------------------- | ----------- | ------------------------------------ | --------- | -------- |
| RDC Die amortization (Std + Cpx)                                | 7           | golden.test.js:174-505               | ✓ covered | OK       |
| EAU monotonicity (tier0 ≥ tier1 tooling)                        | 1           | golden.test.js:501-505               | ✓ covered | OK       |
| K-aware Gallus pitch subtraction                                | 4           | gallusEngine.test.js:35-77           | ✓ covered | OK       |
| Magnetic die min gap 1.5mm (rotary_magnetic)                    | 5           | gallusEngine.test.js:394-427         | ✓ covered | OK       |
| Laser die 0.3mm                                                 | 1           | gallusEngine.test.js:640 (`dieRisk`) | ✓ covered | OK       |
| Flat die 2.0mm                                                  | 1           | gallusEngine.test.js:644 (`dieRisk`) | ✓ covered | OK       |
| bleed_mm=0 edge case                                            | 2           | gallusEngine.test.js:151, 294        | ✓ covered | OK       |
| **0.8 EAU cap factor (explicit)**                               | **0**       | —                                    | **GAP**   | **P1**   |
| **Jig amortization (`tool_cost / eauCap`)**                     | **0**       | —                                    | **GAP**   | **P1**   |
| **`tool_life_ovr` flag**                                        | **0**       | —                                    | **GAP**   | **P1**   |
| **Production die names (woodie/Pinacle/Rotary/Dieset/NC)**      | **0**       | —                                    | **GAP**   | **P1**   |
| **Mixed-die Cpx quote**                                         | **0**       | —                                    | **GAP**   | **P2**   |
| **Unknown die-type fallback** (silent 100,000× overcharge risk) | **0**       | —                                    | **GAP**   | **P1**   |

## Test plan — 10 new golden tests (Phase 1.2)

File: `client/src/services/calcEngine.diecut.golden.test.js` (new sibling, mirrors `calcEngine.golden.test.js` pattern; vanilla `node --test`)

| #   | Test name                                                               | Pins behavior                                                                               | Catches                                                              |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| T1  | `0.8 EAU cap factor is enforced exactly`                                | `tooling = tool_cost / (eau × 0.8)` when tlife > eauCap                                     | Silent change to cap factor (e.g. 0.9 or 1.0 by accidental refactor) |
| T2  | `tooling formula non-Jig: tool_cost / (tlife × layout)` when within cap | `tlife × layout ≤ eauCap` path                                                              | Wrong divisor swap                                                   |
| T3  | `Jig amortization: tool_cost / tlife` ignores layout cavity multiplier  | `isJig=true` path, line 664                                                                 | Jig regression to non-Jig formula                                    |
| T4  | `Jig + Jig& Fixture spelling variants both classify as Jig`             | `ttNorm` normalization                                                                      | Refactor breaking case/space/ampersand handling                      |
| T5  | `Pinacle die (production NPI spelling) reads tool_life from DDL`        | `getToolLife(lib, 'Pinacle die')` returns DDL value, not 1                                  | Production spelling drift                                            |
| T6  | `Wooden die alias 'woodie' (production NPI spelling) reads DDL`         | DDL lookup case-sensitive                                                                   | Operator typo cost explosion                                         |
| T7  | `tool_life_ovr=true overrides DDL with operator value`                  | Line 650-653 priority order                                                                 | Override flag silently ignored                                       |
| T8  | `Unknown die-type falls through to tlife=1 → tooling explodes`          | Negative test: warn about misspell risk; assert `tooling ≈ tool_cost` (1-shot amortization) | **CCL operator types "pinncle die" → silent 100k× overcharge**       |
| T9  | `Mixed-die Cpx: SP-A Pinacle + SP-B Rotary + SP-C Jig`                  | Each SP independent tooling cost                                                            | Cpx aggregate masking per-SP error                                   |
| T10 | `Lesson 24 magnetic die min gap = 1.5mm (HARD_MIN_GAP_MM)`              | `DIE_MIN_GAP_MM.rotary_magnetic === 1.5` + `HARD_MIN_GAP_MM` alias                          | Accidental reset to 1.0 (pre-Sprint S-FLEXO-1 default)               |

## Phase 1.3 — CI guard

Block PR that adds NEW production die type to DDL without adding sibling golden test:

- Pattern: when `Library/DesignTools/ddl_sites.json` (or fixture) adds new key to `tool_life` map → require ≥1 new test in `calcEngine.diecut.golden.test.js` referencing that key
- Implementation: shell script in CI lint phase that diffs DDL fixture keys vs test file references
- File ticket if too complex for initial Phase 1: **MES-3-FIX-TOOL-LIFE-CI-GUARD**

## Out of scope (deferred follow-up)

- **Canonical die-type spelling enforcement** — validator block on operator entry. Currently free-text; should be DDL-dropdown only. File ticket **S-DIE-TYPE-DROPDOWN-VALIDATOR** (P2, post-go-live)
- **Cross-validation NPI vs Legend doc** — fix Pinacle/Pinnacle typo divergence. File **S-DIE-NAME-RECONCILE** (P3, docs-only)
- **`eau_ovr` operator override path** — currently `proc.eau_ovr > 0 ? proc.eau_ovr : auto` (line 639); pin via 1 more test if scope grows
