---
trigger: always_on
description: Ops Control shared-language glossary.
---

# CONTEXT.md — Ops Control shared language

> Glossary so any agent decodes this project's jargon consistently and names new code
> with the same words. Distilled from `CLAUDE.md`; treat as a **living doc** — add a term
> the moment it causes confusion, and record hard-won decisions as one-liners (ADR habit).
> When code and this file disagree, **code wins** (CLAUDE.md Lesson 3).

## People & places

- **Henry / Đặng Thế Thiệp** — project owner; runs the operator hardware tests.
- **Hương** — Backup Engineer (SPOF mitigation; onboarding brief in `docs/cutover/`).
- **CCL Vietnam (Hai Phong)** — production site. Go-live target: **2026-06-30**.
  The site is **Hai Phong**, and the licence card reads `CCL Design Vietnam — Hai Phong`.
  Two older names survive on purpose. **Yen Phong** and **Hai Duong** are left untouched in
  dated records (CLAUDE.md sprint history, CHANGELOG, `docs/cutover/*-2026-*.md`,
  `docs/archive/`) because rewriting a dated document to say something it did not say is
  worse than the confusion it saves. They also stay in **test data** — `Hai Duong` is a site
  KEY in `sga_rate_pct_by_site` inside the frozen-quote fixtures, so changing it would break
  the 20-year reproducibility contract for a cosmetic reason. Seeing either name in those
  places is expected; seeing it in a living doc is a miss.
- **Remote prod box** — Windows server `10.102.3.61:3000` (NSSM service via `deploy.ps1`).

## Runtime surfaces (which bundle is served — ask the URL first)

- **Vite dev** — `:5173`/`:5175`, serves `client/src/**` live via HMR. No rebuild needed.
- **Prod local** — `:3000`, serves the pre-built `client/dist/**`. Rebuild after edits.
- **Prod remote** — `10.102.3.61:3000`, same but rebuild **and** deploy.
- **Production runtime DB** lives at
  `~/Library/Application Support/ops-control-desktop/data/ops.db` (NOT `server/data/ops.db`).

## Screen names (the label moved; the id did not)

Renaming a tab changes its **label only**. Tab ids are serialised into every user's saved
window layout, so they keep the old spelling forever: `rfq-tracker` is still `rfq-tracker`
in ids, routes and logs while the screen itself reads _RFQ Progress_. Seeing the old word
in code is not evidence the rename was missed.

- **RFQ List** / _Danh sách RFQ_ — id `rfq-tracking`, key `nav.tab.rfq_tracking`, under Quoting.
- **RFQ Progress** / _Theo dõi RFQ_ — id `rfq-tracker`, key `nav.tab.rfq_tracker`, under Tracking.
  Was "RFQ Tracker" until #288 (`4a2ac76`); English followed the Vietnamese, which had always
  been unambiguous. Attachments live here — `/api/shared/rfq-tracker/attachments/:id`.
- **Materials & Process** / _Vật tư & Công đoạn_ — id `combined`, key `pricing.tab.combined`.
  Was "Combined" until #162 (`5063219`), which also retired the Materials / Inks / Processes
  sub-tabs into it.
- **Tool Life (shot)** — key `cgrid.proc.tool_life`. The unit is part of the label on purpose
  (#379, `ad81e03`): `tool_life` counts SHOTS while EAU counts PIECES.

**Rule — read the key, do not recall the name.** Two of these screens both contain "RFQ", and a
stale label sends an operator hunting for a screen that no longer exists. This section was written
because an agent told Henry to open "RFQ Tracker" on 2026-09-20, five months after it stopped
being called that.

## Quote / pricing engine

- **calcEngine** — the pricing calculator; **CLIENT-ONLY** single source of truth. Never on server.
- **Std / Cpx** — Standard vs Complex quote types. Cpx contains **subproducts (SP)**.
- **MOQ** — Minimum Order Quantity; quotes carry MOQ **tiers** with per-tier overrides in
  `extra_moqs[i]`. **EAU** — Estimated Annual Usage.
- **RFQ** — Request For Quote (e.g. `RFQ-2026-S0012`); tracked in the RFQ Tracker tab.
- **SP / s_ttl / GM% / VA%** — Selling Price / subtotal / Gross Margin % / Value-Add %.
- **Cost-breakdown buckets** (`bd_*`): `bd_mat_setup`, `bd_mat_run`, `bd_ink_setup`,
  `bd_ink_run`, `bd_proc_setup`, `bd_proc_run`, `bd_pack`.
- **KPI buckets**: `TTL.MAT`, `PROCESS`, `TOOLING`, `PACK&SHIP`. Invariant:
  `TTL.MAT + PROCESS + TOOLING + PACK&SHIP ≈ SUBTOTAL` (see `kpiBuckets.js`; FIX-47).
- **Field-name footgun**: operator's Excel model uses `bd_proc_setup` / `bd_proc_run` /
  `bd_pack`, while calcEngine emits `bd_setup_mach + bd_setup_labor` /
  `bd_labor + bd_overhead` / `packing_ship`. Reconcile — don't assume 1:1.
- **alt-materials "mirror"**: `materials_main` / `materials_alt` / `materials_active`;
  legacy `state.materials` is kept as a MIRROR of the active set so old readers stay green.
- **result shape**: per-row data in `result.rows`, per-tier in `result.tiers[N].rows`,
  per-subproduct in `result.subproducts[spi].rows`.
- **Saved vs display result** — opening a quote recomputes it live against its frozen
  `pricing_snapshot`; every xlsx/CSV, Quote History and the Cost Breakdown list read the
  persisted `quote.result`. An engine change moves the first and not the second until the
  quote is saved again. The drift banner compares the two — never against what Save would
  write — and lights Save (S-SAVED-DRIFT, Lesson 53).
- **Layout-assigned tool cost** — a process whose tool comes from the Layout tab carries
  `tool_cost_src` (`plate`, `cutter-N`) and leaves `tool_cost` at **0**. Resolve through
  `effectiveToolCost`, never the raw cell; the server reads the persisted
  `result.rows.processes[].tool_cost_effective`. A row with no `workcenter` charges
  nothing, tooling included — open question since 2026-09-25 (S-TOOL-COST-READERS).

## Printing & manufacturing

- **Print Type vs print_type_list vs print** (Library DDL keys — easy to mix up):
  `print_type` = semantic ink types (`SS`, `Flexo`, `Indigo`, `Indigo(Primer)`) — use on the
  Inks tab. `print_type_list` = process workcenter list (`Indigo6800`, `SS(Sheet)`,
  `Flexo(Gallus4C)`). `print` = deprecated/redundant.
- **Indigo subtypes** — CCL Vietnam ships `Indigo6800` / `Indigo7800`, not bare `Indigo`.
  Always gate via `isIndigoPrintType()`, never `=== 'Indigo'` (FIX-32/33).
- **Print vs Cut canonical fields** — operator types into the Print sub-tab
  (`print_part_width`, `print_part_length_md`); calcEngine/validators read canonical
  `part_width`, `part_length_md`. `applyPrintToCutSync` auto-mirrors while canonical is 0
  (FIX-32/34).
- **CLICKS** — Indigo click charges. **COV OVR** — coverage override (auto vs manual; `covOvrState.js`).
- **setup_lm / make-ready length** — metres of material run at setup. Material setup, ink
  setup (`area × width × setup_lm / coverage`) and Indigo setup (`⌈setup_lm / 0.98⌉` frames;
  0.98 m is the 980 mm Indigo frame, not a yield) all read it — source: the costing
  workbook, cell T33, column G. `usage` is a per-piece multiplier, not a length, and
  `ink.base_mat` has held a WIDTH since FIX-40 (S-INK-MAKEREADY, Lesson 52).
- **Gallus / plate cylinder / pitch / K / bleed_mm** — flexo cylinder design. **K** = unusable
  plate zone ("vùng cylinder không in"), a constraint `(pitch − K)`, not a display %.
  `bleed_mm` defaults 2 mm/side (print footprint ≠ trim). Magnetic die min lane gap = 1.5 mm.
- General terms: flexo / digital / offset, die-cut, kiss-cut, Pantone/CMYK, anilox,
  substrate / liner / adhesive.
- **MES / WO / Kiosk** — Manufacturing Execution System / Work Order / kiosk PWA (shop floor).

## Security & authorization

- **3-layer auth**: `role` (sys/admin/cost/user/viewonly) + `department` + `permission_group_id`.
  Every access goes through `permissionService.resolveTabAccess(user, tabId)` →
  `hidden | read | edit`. `sys` = god mode.
- **requireTabAccess(tabId)** — server middleware on every write route (defense-in-depth).
- **Untouchable .env keys** (never rotate casually; deploy scripts preserve them):
  `OPS_TOTP_KEY`, `OPS_EXPORT_HMAC_KEY`, `OPS_KIOSK_KEY`, `LICENSE_PUBKEY`.
- **Library/** is a trust boundary — validated via `librarySchema.js` on read.

## Build / release / CI

- **Stack**: Node.js + React + SQLite (better-sqlite3) + Electron desktop + Kiosk PWA.
  Repo `thiepdanghd82/Ops-Control`. Built in Antigravity IDE + Claude Code.
- **Packaging**: DMG installers, SERVER vs CLIENT roles. Beware the Electron NMV
  (NODE_MODULE_VERSION) ABI trap with native modules outside asar (Lesson 28).
- **Conventions**: conventional commits; commitlint `body-max-line-length = 120` (wrap body
  lines ≤120); every "shipped/landed" claim cites a commit SHA (Lesson 0).
- **Key commands**: `npm test`, `npm run build` (prebuild hook regenerates Word docs),
  `npm run preflight`, `node scripts/help/self-check.mjs` (smoke-checks every tab).
