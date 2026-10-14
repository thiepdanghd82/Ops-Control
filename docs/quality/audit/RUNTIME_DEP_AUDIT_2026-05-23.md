# Runtime Dependency Audit — 2026-05-23

**Closes**: [#60](https://github.com/thiepdanghd82/Ops-Control/issues/60)
**Reference incident**: PR #58 (exceljs/jszip `ERR_MODULE_NOT_FOUND` in packaged DMG, 4 days latent breakage)
**Branch state at audit**: `main` @ `56d5b97` (release 1.5.10), clean working tree.

## TL;DR

**Current state is clean.** All 14 runtime-imported npm packages map to root
`dependencies` correctly (12 direct + 2 via `await import(...)`). **No P0/P1
runtime imports are missing or mis-classified.**

Two latent risks worth filing as follow-ups (both P2/P3, neither blocks ship):

| ID  | Package          | Risk                                                                                       | Severity |
| --- | ---------------- | ------------------------------------------------------------------------------------------ | -------- |
| F-1 | `bytenode`       | Referenced by `scripts/build-bytecode.js` but absent from every `package.json` in the tree | P2       |
| F-2 | `puppeteer-core` | Imported by 4 `scripts/help/*.mjs` runtime dev tools, declared only in `devDependencies`   | P3       |

The audit's higher-value deliverable is the **regression guard** so the exceljs
class of bug cannot recur — see "Recommended actions" below.

## Scope

**Surfaces audited** (everything that ships inside the DMG via
`scripts/build-desktop.sh` extraResources):

```
{ from: TMP/server,   to: app/server,   filter: ['**/*', '!**/*.test.js', '!**/legacy/**'] }
{ from: TMP/domains,  to: app/domains,  filter: ['**/*', '!**/*.test.js', '!**/tests/**']  }
{ from: TMP/scripts,  to: app/scripts,  filter: ['**/*.js', '!**/*.test.js']               }
```

**Resolver context**: build runs `npm install --omit=dev` from ROOT, populates
`TMP/node_modules` → packaged as `app/node_modules`. Any import inside
`server/**`, `domains/**`, or `scripts/**/*.js` (note: `.mjs` excluded by
filter) MUST resolve via the root `dependencies` tree (direct or transitive)
to survive packaging.

**Method**:

1. Enumerated all 165 `.js`/`.mjs`/`.cjs` runtime files (excluding tests, legacy, `_legacy`)
2. Regex-extracted bare-name imports (skipping relative paths + `node:` builtins)
3. Cross-referenced each against root `package.json` dependencies / devDependencies

Defense scan: searched for dynamic-string imports (`require(\`...\`)`,
`import(\`...\`)`) that might evade the regex — 3 hits found, all using
relative paths or runtime-generated shim paths (none import external packages).

## Findings

### Clean imports (12 direct + 2 dynamic)

| Package           | How imported                        | First-seen file                                  | Status                                |
| ----------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `argon2`          | `await import('argon2')`            | `server/services/authService.js:278`             | OK — root deps                        |
| `bcryptjs`        | static + `await import('bcryptjs')` | `server/services/authService.js:291`             | OK — root deps                        |
| `better-sqlite3`  | static                              | `server/db/connection.js`                        | OK — root deps                        |
| `compression`     | static                              | `server/index.js`                                | OK — root deps                        |
| `cors`            | static                              | `server/index.js`                                | OK — root deps                        |
| `dotenv`          | static                              | `server/index.js`                                | OK — root deps                        |
| `exceljs`         | static                              | `server/services/quoteExport/sheets/00-cover.js` | OK — root deps (moved by PR #58)      |
| `express`         | static                              | `server/domains/sales/routes/quotes.js`          | OK — root deps                        |
| `jszip`           | static                              | `server/services/quoteExport/zip.js`             | OK — root deps (added by PR #58)      |
| `multer`          | static                              | `server/routes/costApi.js`                       | OK — root deps                        |
| `proper-lockfile` | static                              | `server/utils/asyncLock.js`                      | OK — root deps                        |
| `xlsx`            | `await import('xlsx')`              | `server/routes/costApi.js:196`                   | OK — root deps (aliased `@e965/xlsx`) |

`argon2` and `xlsx` are dynamic-imported — they survived the initial regex pass
but a follow-up scan caught them. Both are correctly declared in
`dependencies`. `authService.js` even has a try/catch fallback to `bcryptjs`
if `argon2` fails to load, so that path is doubly safe.

### F-1 — `bytenode` referenced but not installed (P2)

**File**: `scripts/build-bytecode.js`
**Imports**: `require('bytenode')` at line 64 (direct) and emits
`require('bytenode')` into a shim template at line 64-65.

**Why this is currently latent (not P0/P1)**:

- `build-bytecode.js` targets `server/services/calcEngine.js`,
  `server/services/inkCalcCore.js`, `server/services/layoutOptimizer.js`,
  `server/services/printAreaCore.js` — **none of these exist server-side**.
  They live at `client/src/services/*.js` (verified). The script logs `[skip]`
  for every target and exits without compiling anything.
- No `.jsc` artifacts and no `.js.bak` artifacts anywhere in the tree → the
  script has never successfully run.
- `scripts/release.sh` is the only invoker (a manual ops script, not on any
  CI path).

**Why it still warrants a fix**:

- The shim template at line 64 unconditionally emits `require('bytenode')`.
  If anyone ever fixes the paths and runs the script, the resulting shim
  modules will crash at runtime in the packaged DMG because `bytenode` is
  absent from `package.json`.
- The error message at line 73 hints at the historical placement: `cd desktop
&& npm install --save-dev bytenode`. Even that prescription would be wrong
  for the embedded server (devDeps stripped by `--omit=dev`).

**Two valid fixes** (operator's call):

1. **Repair the script** — update `IP_FILES` to point at the real client paths
   (`client/src/services/calcEngine.js` etc.). The bytecode protection
   targets client code, so `bytenode` belongs in `client/devDependencies`
   (since `client/dist` is pre-built into static assets — no runtime resolve
   needed at all inside the DMG).
2. **Delete the script** — bytenode IP protection has never shipped; the
   feature is essentially abandoned. Drop `scripts/build-bytecode.js`,
   `scripts/release.sh` references, and the `[3/6] Bytenode compile IP
files…` step. Removes a dead-code maintenance burden.

Recommend option 2 (delete) unless IP-protection-via-bytecode is a roadmap
item — has anyone asked about this in the last 12 months?

### F-2 — `puppeteer-core` imported by runtime dev tools (P3)

**Files**:

- `scripts/help/capture-subtabs.mjs`
- `scripts/help/capture-with-demo.mjs`
- `scripts/help/capture-screenshots.mjs`
- `scripts/help/self-check.mjs`

**Imports**: `import puppeteer from 'puppeteer-core'` (all 4)
**Declared**: `devDependencies` only

**Why currently safe**:

- All 4 files are `.mjs`; `build-desktop.sh` filter on `scripts/` is
  `'**/*.js'` (line 71) — `.mjs` files are NOT copied into the DMG.
- The 4 tools are operator-facing dev utilities (screenshot capture for the
  help system, smoke-check harness referenced from CLAUDE.md). They run from
  source repo with full deps installed — devDeps placement is correct.

**Why it warrants documentation**:

- If anyone ever renames one of these to `.js` (e.g. to standardize file
  extensions, or because a refactor extracts shared logic into a `.js`
  module), the file would land in `app/scripts/` and crash at runtime when
  invoked from inside the DMG.
- The trap is identical to PR #58's exceljs incident, just on a quieter
  surface.

**Action**: no code change needed. The regression-guard work (below) will
catch this automatically if anyone trips into the trap later.

## Recommended actions

### A. Ship a CI regression guard (closes #60)

The audit confirms `main` is currently clean, but the EXCELJS class of bug
will recur unless a guard runs on every PR. Two options from the issue body:

**Option 1 — lint rule** (preferred; cheaper, gives in-editor feedback):

Add `eslint-plugin-import-x` (or `eslint-plugin-n`) and configure
`no-extraneous-dependencies` with `devDependencies: false` for the runtime
surface:

```js
// eslint.config.js — additive block
{
  files: ['server/**/*.{js,mjs,cjs}', 'domains/**/*.{js,mjs,cjs}', 'scripts/**/*.js'],
  ignores: ['**/*.test.js', '**/tests/**', '**/legacy/**'],
  rules: {
    'import-x/no-extraneous-dependencies': ['error', {
      devDependencies: false,
      packageDir: __dirname,  // anchor at root, not nearest package.json
    }],
  },
}
```

Run as `npm run lint`. CI already runs lint per `.github/workflows/`. Cost:
~2 lines in eslint config + 1 new devDep. Catches both classes — undeclared
(F-1's bytenode pattern) AND devDeps-only-but-imported (F-2's puppeteer-core
pattern).

**Option 2 — runtime smoke** (heavier; useful as belt-and-braces):

Add `scripts/check-runtime-deps.js`:

```bash
# In a clean temp dir
npm install --omit=dev --no-audit --no-fund --ignore-scripts
# For every entry point likely to load at server start:
node -e "import('./server/index.js').catch(e => { console.error('FAIL', e.message); process.exit(1) })"
# Per-service entry-point probes:
for svc in server/services/quoteExport/index.js server/services/authService.js; do
  node -e "import('./$svc').catch(e => { console.error('FAIL $svc', e.message); process.exit(1) })" || exit 1
done
```

Add as a CI step that runs in a `npm install --omit=dev` clean dir on every
PR. ~30 lines. Catches anything the lint rule misses (e.g. transitive
dependency relied on without an explicit declaration — npm hoisting
shenanigans).

**Recommendation**: ship BOTH. Lint gives developer-time feedback;
runtime-smoke catches edge cases the lint can't see. If pick-one, lint —
covers 90% of risk for ~10% of effort.

### B. Decide F-1 (bytenode dead-code)

File a follow-up issue (or fold into this PR): repair or delete
`scripts/build-bytecode.js`. Recommend delete unless someone confirms the
IP-protection feature is still on the roadmap.

### C. F-2 needs no immediate action

Documented above. The regression guard in (A) will surface it if anyone trips
into the `.mjs → .js` rename trap later.

## Acceptance checklist (from #60 body)

- [x] Audit `server/services/**` top-level imports — list all non-`node:` packages → extended to full `server/`, `domains/`, `scripts/`
- [x] Cross-check each against root `package.json` `dependencies` → 12/14 clean, 2 findings documented
- [ ] Add CI smoke OR lint rule → **see Recommended actions A** (proposal ready; needs operator approval to ship)
- [ ] Decide F-1 disposition → **see Recommended actions B** (needs operator decision)

## Appendix — audit reproducer

Run this from repo root to reproduce the import scan at any future date:

```bash
# Extract all bare-name imports from runtime surface
for dir in server domains scripts; do
  find "$dir" -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) \
    -not -name "*.test.js" -not -path "*/tests/*" -not -path "*/legacy/*"
done | xargs grep -hE "^(import .* from |import |const .* = require|require\(|import\()" \
  | grep -oE "from ['\"]([^'\"]+)['\"]|require\(['\"]([^'\"]+)['\"]\)|import\(['\"]([^'\"]+)['\"]\)" \
  | grep -oE "['\"][^'\"]+['\"]" \
  | tr -d "'\"" \
  | grep -vE "^(\.|/|node:)" \
  | sort -u

# Then for each, check: is it in root dependencies?
node -e "const p=require('./package.json'); \
  ['bytenode','puppeteer-core' /* etc */].forEach(pkg => \
    console.log(pkg, (p.dependencies||{})[pkg] ? 'OK' : (p.devDependencies||{})[pkg] ? 'DEVDEPS' : 'MISSING'))"
```
