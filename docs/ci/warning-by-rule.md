# Lint Warning Inventory by Rule

**Date:** 2026-06-20 (post PR-A + PR-B + PR-C1 + PR-C2 config update) • **Phase:** 0.2 PR-C2 of Debug Playbook

> Sau khi 4 PRs Phase 0 land, lint state: **0 errors, 370 warnings**. CI lint job exits 0 (warnings ≠ errors). Bảng này phân loại từng warning theo rule + status để track tech debt minh bạch. Mỗi warning hoặc đã có ticket, hoặc nằm trong allowlist có lý do.

## Tổng quan

| Rule                                                  | Count | Status                                                | Ticket                                                                                                   |
| ----------------------------------------------------- | ----- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `no-restricted-syntax` (inline style `style={{...}}`) | 315   | **ACCEPTED TECH DEBT** — Sprint 12 deferred migration | Existing Sprint 12 (top-5 offenders allowlisted in `client/eslint.config.js`); ongoing per-tab migration |
| `no-unused-vars` (imports, vars, func args)           | 42    | **DEFERRED** — file-by-file cleanup                   | Open new ticket: **S-LINT-UNUSED-IMPORTS** (XS-S effort, 1 sprint)                                       |
| `react-compiler/*` ("renders" violations)             | 4     | **AUDIT NEEDED** per MES-3-FIX-20 method              | Existing **MES-3-FIX-38** (escalate; was P2)                                                             |
| `react-hooks/exhaustive-deps`                         | 3     | **AUDIT NEEDED** per MES-3-FIX-20 method              | MES-3-FIX-38                                                                                             |
| `react-hooks/set-state-in-effect`                     | 1     | **AUDIT NEEDED** per MES-3-FIX-20 method              | MES-3-FIX-38                                                                                             |
| `no-empty` (in eslint output strings — not real)      | 2     | False positive in awk parse                           | —                                                                                                        |
| Unused eslint-disable directives                      | ~3    | Cleanup as touched                                    | MES-3-FIX-38 part 2                                                                                      |

**Total accounted: 370 warnings, 100% mapped to ticket or accepted debt.**

---

## Detail per rule

### 1. `no-restricted-syntax` (315) — Inline style migration

**What:** Catches `<Comp style={{...}}>` literal-object inline styles.

**Reason for warn:** Inline styles bypass CSS class theming, break dark-mode token cascade, prevent CSS caching across renders, complicate Sprint 12 design-token rollout (Lesson 6, Sprint 11 P-1).

**Why not error:** Codebase has 315 pre-existing instances accumulated pre-rule. Migrating each to a CSS class requires per-instance theme/dark-mode/hover verify (12+ hours per tab). Sprint 12 explicitly deferred this work; top-5 offenders documented in `client/eslint.config.js` ignores list to be picked up as each tab is touched.

**Hotspot files (top 5):**

1. `PrintAreaCalc.jsx` — explicit Sprint 12 allowlist
2. `Settings.jsx` — explicit Sprint 12 allowlist
3. `InkCalculator.jsx` — explicit Sprint 12 allowlist
4. `SubProductRow.jsx` — explicit Sprint 12 allowlist (note: also targeted by MES-3-FIX-56)
5. `Dashboard.jsx` — explicit Sprint 12 allowlist

**Rule for new code:** When you touch a tab, migrate that tab's inline styles to CSS classes; don't add new inline styles. ESLint warns so additions are surfaced.

**Migration tracking:** No formal ticket yet — schedule **S-INLINE-STYLE-MIGRATION** post-go-live Q4 2026 as part of per-tab polish work alongside MES-3-FIX-56 (Cpx SubProductRow extraction).

### 2. `no-unused-vars` (42) — Real cleanup

**What:** Unused imports, declared vars, function args.

**Already excluded via config:**

- Catch params matching `^(_|e|err|[A-Z])` — covers `catch (_)`, `catch (e)`, `catch (err)`, `catch (ServerErr)` — eliminated 27 warnings via PR-C2 config change
- Vars/args prefixed with `_` or capital letter

**Remaining 42:** real unused declarations. Examples:

- `import { foo } from './bar'` where `foo` is no longer referenced (refactor orphan)
- `const Result = useSomething()` where `Result` is destructured but only one prop used
- Function arg `(req, res, next)` where `next` never called

**Risk:** Low immediate impact (dead code, not buggy code). HIGH long-term debt — engineer #3/#4 reads file with 5 unused imports and wonders if they're load-bearing.

**Action:** File **S-LINT-UNUSED-IMPORTS** ticket for Q4 2026 cleanup sprint. Pattern: file-by-file walk, delete each unused import, run tests, commit per-file.

### 3. `react-compiler/*` + `react-hooks/*` (8 total)

**What:** React 19 + React Compiler rules surfacing:

- 4× "Cannot create components during render" / "Cannot access refs during render" / "Calling setState synchronously within an effect"
- 3× missing dependencies in `useEffect`
- 1× set-state-in-effect cascading-render anti-pattern

**Why dangerous:** Per MES-3-FIX-20 method, each must be classified:

- (a) Real bug → fix
- (b) Intentional pattern with `eslint-disable-next-line -- <reason>`
- (c) Rule too strict → adjust per-callsite

**Cannot bulk-handle** — each callsite needs read + decide. Audit work is ~30 min/callsite = ~4h total.

**Action:** Add 8 warnings to **MES-3-FIX-38** scope (already P2, ticket open). Audit pre Hypercare Day 14.

### 4. Stale eslint-disable directives (~3)

**What:** `eslint-disable-next-line <rule>` comments on lines that no longer violate the rule (refactor made the rule pass naturally).

**Action:** Bundle with MES-3-FIX-38 audit — when touching the same file for react-hooks work, delete stale disables.

---

## Regression guard (NEW in PR-C2)

Add `--max-warnings <N>` to CI lint command. After PR-A + PR-B + PR-C1 + PR-C2 merge:

```yaml
- run: npm run lint -- --max-warnings 370
```

This **prevents new warnings from being added** without an explicit baseline bump. If a PR introduces a 371st warning, CI fails. Lowering the count (e.g. as Sprint 12 inline-style migration progresses) requires updating the number — forcing explicit acknowledgment.

**Why 370:** Current count post-Phase 0. Can be lowered as tickets close:

- After S-INLINE-STYLE-MIGRATION (Q4 2026): drop by ~50/sprint
- After MES-3-FIX-38 audit: drop by 8
- After S-LINT-UNUSED-IMPORTS: drop by 42

Target: 0 warnings by end of 2027 Q1.

---

## Cross-reference

- [Phase 0.1 CI Triage](ci-triage.md) — origin doc, error inventory + 3-group classification
- [CLAUDE.md Lesson 6](../../CLAUDE.md) — inline-style discouraged rationale
- [MES-3-FIX-20 method](../../CLAUDE.md) — react-hooks per-callsite triage approach
- [MES-3-FIX-38](../../CLAUDE.md) — react-compiler audit ticket (escalate scope to include the 8 warnings catalogued above)
