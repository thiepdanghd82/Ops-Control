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
- **CCL Vietnam (Yen Phong)** — production site. Go-live target: **2026-06-30**.
- **Remote prod box** — Windows server `10.102.3.61:3000` (NSSM service via `deploy.ps1`).

## Runtime surfaces (which bundle is served — ask the URL first)

- **Vite dev** — `:5173`/`:5175`, serves `client/src/**` live via HMR. No rebuild needed.
- **Prod local** — `:3000`, serves the pre-built `client/dist/**`. Rebuild after edits.
- **Prod remote** — `10.102.3.61:3000`, same but rebuild **and** deploy.
- **Production runtime DB** lives at
  `~/Library/Application Support/ops-control-desktop/data/ops.db` (NOT `server/data/ops.db`).

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
