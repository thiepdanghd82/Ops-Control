# ADR-0012 — Per-domain i18n registration

**Status:** Accepted (v1.3 P3.3 → M3, 2026-04-29)
**Deciders:** v1.3 Senior Architect persona
**Builds on:** README FIRST §i18n (v1.3 layout target)
**Supersedes:** none

---

## Context

v1.2 shipped a single monolithic `client/src/i18n/strings.js` file
(~340 keys). Two problems compounded over Sprints 1–14:

1. **Translator workflow** — every Vietnamese-string update touched
   the same 5000-line file. Merge conflicts every sprint.
2. **Domain ownership invisible** — `audit.title`, `pricing.tier`,
   `chat.send` all next to each other; no way to grep "what does
   the security domain own?".

v1.3 had `domains/<name>/shared/i18n.js` planned in the
ARCHITECTURE.md target, but v1.2 doesn't have a workspace setup.
This ADR captures the in-place compromise: keep `strings.js` as a
thin runtime store + extension point; move the actual key/value
data into per-domain modules under `client/src/i18n/domains/`.

## Decision

**Every domain that has more than 5 i18n keys MUST own a module
in `client/src/i18n/domains/<name>.js`.**

The module:

- Side-effect imports `registerStrings` from `../strings.js`.
- Calls `registerStrings({...})` with its slice at module load.
- Is side-effect-imported from `client/src/main.jsx` so it runs
  at boot.

### Module shape

```js
/**
 * <Domain> i18n (v1.3 <phase>).
 *
 * SAP-<X> analogue. Owns: <one-line ownership statement>.
 * Currently shipping: <prefix>.* (<N> keys).
 */
import { registerStrings } from '../strings.js';

registerStrings({
  '<prefix>.<key>': { en: '<EN>', vi: '<VI>' },
  // ...
});
```

### Naming rules

- **Prefix == namespace.** `pricing.*` lives in `costing.js` (the
  costing domain). `audit.*` lives in `security.js`. One prefix
  per domain; never split a prefix across modules.
- **No prefix collision.** If two domains genuinely need the same
  string (e.g. "Save"), put it in `strings.js` under `common.*`,
  not duplicate it in two domain modules.
- **Keep the prefix terse.** `qh.col.customer` (Quote History) is
  fine. `salesQuoteHistoryColumn.customer` is not — read latency
  in JSX matters more than self-documentation in this case.

### Module ownership table

| Domain module | Owns prefixes                                                                    | SAP analogue         |
| ------------- | -------------------------------------------------------------------------------- | -------------------- |
| `security.js` | `login.* totp.* audit.*`                                                         | SU + BC (auth/audit) |
| `costing.js`  | `pricing.* material_lib.* printarea.* inks.*`                                    | CO                   |
| `sales.js`    | `qh.* rfq.*`                                                                     | SD                   |
| `basis.js`    | `chat.* dashboard.* settings.* appearance.* bootstrap.* common.lang_toggle_aria` | BC                   |
| `mes.js`      | `hw.* mode.*`                                                                    | MES                  |
| `planning.js` | `planning.*`                                                                     | PP                   |

### What stays in strings.js

`strings.js` itself is a single-file fallback for the platform
shell (sidebar, app chrome, top-bar) and for keys without an
obvious domain home:

| Prefix     | Why kept platform-level                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `nav.*`    | Sidebar IS the platform shell — module/section/tab labels are the shell's vocabulary   |
| `common.*` | Cross-domain UI atoms (Save, Cancel, Loading...)                                       |
| `picker.*` | Library picker is shared between costing + library + sales — owned by no single domain |

These can later move to `client/src/i18n/domains/platform.js` if
a consensus emerges, but currently moving them would just split
the platform shell across two files for no win.

### Boot order

`main.jsx` imports modules in this order:

```js
import './i18n/domains/security.js';
import './i18n/domains/costing.js';
import './i18n/domains/sales.js';
import './i18n/domains/basis.js';
import './i18n/domains/mes.js';
import './i18n/domains/planning.js';
```

Order doesn't matter for non-overlapping prefixes (each domain
owns its own). For accidental collisions (e.g. two domains
register `pricing.tier`), **last-imported wins**. The naming
rule above prevents this in practice.

## Consequences

### Positive

- **Translator workflow.** A Vietnamese update for chat lands in
  one ~50-line file (`basis.js`). No 5000-line merge conflicts.
- **Domain ownership grep-able.** `grep -l 'rfq\.col' src/i18n/domains/`
  surfaces `sales.js` instantly.
- **Boot perf.** Modules are JS imports; bundler tree-shakes them
  into the same chunk. No runtime overhead vs the monolith.
- **strings.js as a thin shell.** It's now a 72-key registry +
  the `translate()`/`registerStrings()` API. Down from ~340 keys
  - the entire data block.

### Negative

- **Two places to look.** If a translator doesn't know that
  pricing keys are in `costing.js`, they grep strings.js, find
  nothing, and assume the key is missing. Mitigation: `strings.js`
  comment lists every migrated prefix + target file.
- **Module count grows.** 6 module files today; could be 12 if
  every secondary feature needs its own slice. Hard cap at 1
  module per top-level SAP domain — sub-features extend their
  domain module rather than spawning siblings.
- **No type-checking.** A typo in a prefix (`'pricnig.tier'`)
  goes undetected until UI displays the literal key. Mitigation:
  `strings.test.js` lint rule (`strings.lint.test.js` already
  exists) checks all keys match the documented prefix table.

### Reversal cost

Trivial. Inline every `registerStrings({...})` call body back
into `strings.js`'s `STRINGS = {...}`. The runtime contract is
unchanged.

## Alternatives considered

### Domain-folder colocation (`client/src/modules/cost/i18n.js`)

Rejected for v1.3-in-place. Would require import-side updates in
every consumer and breaks the single `useI18n()` lookup. Saved
for the v1.3 → v2 layout port (vertical slicing per
ARCHITECTURE.md).

### `react-i18next`

Rejected. v1.3 keeps the v1.2 stack; switching to react-i18next
adds a 30 kB dependency for no functional gain (we don't need
namespace switching at runtime, lazy-loaded translations, etc.).

### TypeScript-typed key catalogue

Rejected. v1.2 is plain JS; introducing TS just for the i18n
registry is disproportionate. JSDoc types could approximate
later if the registry grows past ~500 keys.

### YAML/JSON external translation files

Rejected. Build pipeline complexity (compile YAML → JS at
prebuild) for no advantage when both translators are engineers
who can edit JS.

## Migration history

| Phase            | Module added                           | Keys moved                                                                                                       | strings.js after |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| Start of session | –                                      | –                                                                                                                | ~340 keys        |
| P3.3             | security.js                            | audit.\* (15)                                                                                                    | ~325             |
| G2               | costing.js                             | pricing.\* (19)                                                                                                  | ~306             |
| H2               | sales.js                               | qh._ + rfq._ (33)                                                                                                | ~273             |
| J2               | (extend security)                      | login.\* (33)                                                                                                    | ~240             |
| K1               | basis.js                               | chat.\* (34)                                                                                                     | ~206             |
| L3               | mes.js                                 | hw._ + mode._ (90)                                                                                               | ~116             |
| M3               | (extend basis + costing) + planning.js | dashboard._ + appearance._ + settings._ + bootstrap._ + planning._ + printarea._ + inks._ + material_lib._ (~52) | **72**           |

Net: 80 % of keys now domain-owned. Remaining 72 keys (nav._ +
common._ + picker.\*) are platform-shell strings — kept in
strings.js by design.

## References

- `client/src/i18n/strings.js` — registry + `registerStrings()` extension point
- `client/src/i18n/domains/{security,costing,sales,basis,mes,planning}.js` — domain modules
- `client/src/main.jsx` — boot-time imports
- `client/src/utils/useI18n.js` — consumer hook (unchanged from v1.2)
- ADR-0011 — domain router factory pattern (sibling — server-side)
