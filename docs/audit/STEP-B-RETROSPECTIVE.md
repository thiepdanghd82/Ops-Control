# Step B Retrospective — Production Readiness Audit closure

**Audit cycle:** 2026-05-03 (Phase 0 discovery) → 2026-05-04 (Step C UAT checklist)
**Branch:** `fix/pre-go-live-p0` (12 commits ahead of `main` + 1 commit on `main` for B3 disposition)
**Outcome:** ⚠ GO WITH CONDITIONS → ✅ GO; 1 602 → 1 618 tests; 0 regressions; 7/7 P0 items shipped.

This doc captures institutional knowledge that didn't fit in the per-fix evidence (`STEP-B-fix-summary.md`) or the verdict update (`FINAL-REPORT.md`). Read it before the next audit cycle to avoid re-learning the same lessons.

---

## 1. Executive Summary

| Metric                                 | Value                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Audit cycle duration                   | ~24h wallclock incl. overnight gap (Phase 0 → Step C)                                              |
| Step B implementation                  | 15h 1m wallclock (Fix 1 18:01 → Fix 7 09:02 next day)                                              |
| Total commits                          | 11 on `fix/pre-go-live-p0` (6 audit phase + Step A + 7 fixes + Step D + Step C) + 1 on `main` (B3) |
| Original audit findings                | 62 (0 BLOCKER, 8 MAJOR, 24 MINOR, 30 OK)                                                           |
| Hidden findings surfaced during Step B | 5 (registered below)                                                                               |
| **Total findings catalog**             | **67**                                                                                             |
| Verdict trajectory                     | ⚠ GO WITH CONDITIONS → ✅ GO                                                                       |
| Test count                             | 1 602 → 1 618 (+16; 0 regressions)                                                                 |
| LOC delta on `fix/pre-go-live-p0`      | +3 195 / −1 276 = +1 919 net across 30 files                                                       |
| Recovery anchors active                | 2 git tags + 1 tarball + 2 stashes                                                                 |

---

## 2. Hidden Findings Registry (5 items)

These were NOT in the Phase 0-5 audit. They surfaced as side observations during Step B fix work — most were caught during pre-implementation findings phases. Filed for future-audit awareness, not as scope expansion on the P0 hotfix.

### F-FU-1 — Hardcoded `'Sign in'` bypassed i18n

- **Discovered during:** Fix 4 pre-implementation findings (Puppeteer probe of `LoginPage.jsx:561`)
- **Closed in:** Fix 4 (commit `6b8542f`)
- **Severity:** 🟡 MINOR
- **Pattern:** _Adjacent fix opportunity in same file._ When you're already touching `LoginPage.jsx` for a11y polish, bundling the i18n leak fix saves a separate pass. The new `login.heading.signin` key (EN/VI) was the only addition needed.

### F-FU-2 — Wire-format `msg` vs `error` inconsistency

- **Discovered during:** Fix 3 Bước 2 review (reading `AuthContext.jsx:162` to understand client-side error display)
- **Closed incidentally:** Fix 3 (commit `6568eef`) — not as a separate fix, but as a side effect of unifying the response body field name `msg` → `error`
- **Severity:** 🟢 (latent, never user-visible because AuthContext was already preferring `error` first)
- **Pattern:** _Latent bug surfaced when touching adjacent code._ The audit-graded fix (response unification) incidentally closed an inconsistency the original audit didn't flag. Reading the consumer-side code before changing the producer-side caught it.

### F-FU-3 — `deploy.sh` vs `deploy.ps1` vs `.env.example` drift

- **Discovered during:** Step A verification of F4-5 (cross-checking which file actually drives prod)
- **Closed in:** Fix 1 (commit `e75cac9`)
- **Severity:** 🟠 MAJOR (concealed — single-occurrence audit grep missed the cross-file inconsistency)
- **Pattern:** _Cross-file consistency check during single-file fix._ The audit treated F4-5 as a deploy.sh issue. Step A revealed that prod is actually Windows + deploy.ps1, AND `.env.example` had no precedence comment, AND deploy.bat was unsynced. One MAJOR finding became a 3-file fix. **Lesson:** for any deploy/config finding, immediately grep all sibling deploy scripts.

### F-FU-4 — Sibling `MIGRATION*` files have different scope

- **Discovered during:** Fix 5 Finding 1 (locating the migration guide)
- **Documented in:** Fix 5 commit body (`bed7824`) + Step C cross-references
- **Severity:** 🟢 (documentation hygiene)
- **Pattern:** _"Edit the right file" check before any edit._ `MIGRATION_GUIDE.md` (root, operator-facing) was the F4-21 target. `README FIRST/MIGRATION.md` (233 LOC, source-tree reorg map for the v1.3 folder reorg that never shipped) is a DIFFERENT document — same family name, different scope. Editing the wrong one would have produced an authoritative-looking but wrong update. Pre-implementation findings caught this in Bước 1.

### F-FU-5 — bcrypt → argon2id migration window timing leak (~330 ms residual)

- **Discovered during:** Fix 3 timing analysis (Phase 3 benchmark expanded with bcrypt-cost-12 path)
- **Action:** Time-bound; auto-closes per-user on first successful login post-deploy via `upgradeLegacyPasswordIfNeeded()`
- **Severity:** 🟡 MINOR (time-bound)
- **Re-evaluate:** 30 days post-deploy via `auditLegacyPasswords()` count in server boot log
- **Pattern:** _Time-bound technical debt with auto-resolution._ The fix accepts a known short-term leak in exchange for not slowing legitimate users by 380 ms on every typo. Documented in code (`DUMMY_ARGON2_HASH` block in `authService.js`) + here. **Lesson:** time-bound debt is OK if (a) auto-closing, (b) tracked in a registry, (c) re-evaluation date set.

---

## 3. What Worked Well

### 3.1 Pre-implementation findings phase (10-15 min per fix)

For each non-trivial fix (Fix 3, 5, 7), spent 10-15 min running findings BEFORE writing code. ROI captured 4 of the 5 hidden findings + saved at least one wrong-file edit (F-FU-4 alone justified the ritual). **Pattern to keep:** Pre-implementation findings are mandatory for any fix touching auth, security, deploy, or operator-facing docs.

### 3.2 Three-layer recovery anchors for Fix 6

Git tag + raw filesystem tarball + git stash verify (push then pop to confirm mechanic works in current state). 5-min setup cost; enabled aggressive 42-WIP-entry triage with zero work-loss risk. Stash-pop-test was load-bearing — found out the stash mechanic worked WITHOUT actually losing the working tree, before relying on it. **Pattern to keep:** for any cleanup operation touching ≥10 files, set up at least 2 of the 3 anchors.

### 3.3 Self-correction on suspicious test data (Hana / Jet episode)

During Fix 3 timing analysis, the Hana account showed implausibly fast wrong-pw response (<10ms). Instead of reporting the leak as fixed, paused, investigated, found Hana was rate-limited from earlier tests, switched to Jet (un-locked) to expose the real ~370ms bcrypt cost. **Pattern to keep:** "challenge unexpected results before concluding" — especially when results would prematurely declare success.

### 3.4 Atomic commits (1 fix = 1 commit)

Each P0 fix shipped as one commit with: P0 marker in subject, audit-finding ID, change summary, verification evidence, risk note, co-author. Easy revert, easy review, clean git history. Required: discipline about scope creep — Fix 4 grew to include F-FU-1 because it's adjacent file, but the commit body called that out explicitly so reviewers see the bonus.

### 3.5 Bilingual EN/VI for operator-facing docs

`docs/Use guide/login-retry.md` from Fix 3 → MIGRATION_GUIDE.md from Fix 5 → STEP-C-uat-checklist.md from Step C. Three docs, same pattern, zero re-thinking of structure. CCL Vietnam team has reusable template now. The "What you DON'T need to do" subsection (Fix 5) is a new addition worth keeping — explicit anxiety-reducer for operators reading a migration guide.

### 3.6 Negative findings documented (F-FOLLOW-UP-4 in Fix 3)

Auth-adjacent endpoints (`/auth/forgot-password`, `/auth/register`, `/users/:username`) audited in Fix 3 Bước 0 — no enumeration vectors found. Filed as a verified clean finding rather than just dropping the inquiry. Future endpoint additions in `/auth/*` can reference this confirmation. **Pattern to keep:** negative results are findings too.

---

## 4. What Didn't Work / Friction Points

### 4.1 Browser Agent gap for authenticated flows

Phase 2 functional testing only covered public endpoints + login-page rendering. Could not exercise post-login flows (Dashboard, Quote History, etc.) without Playwright + seeded auth user. Compensation: **Step C UAT documentation** generated explicit operator-side scenarios. **Future audit:** pre-install Playwright + seed an audit-only user account in Phase 0 setup, so Phase 2 can hit authenticated routes.

### 4.2 commitlint conventions learned by trial

Three commit attempts rejected during Step B for: subject uppercase, body line >120 chars, scope outside enum. Ate ~10 min cumulative + cluttered the conversation log. **Future audit:** document the local commitlint contract upfront (subject lowercase, ≤72 chars; body ≤120 chars/line; scope from `[security, platform, ...]`). One-time CONTRIBUTING.md or audit-playbook addition pays for itself.

### 4.3 Husky lint-staged auto-format inflates diff stats

Reported diff sizes were sometimes inflated by prettier whitespace reformat (e.g. Fix 5: stat showed +175 / −88 vs my real +87 net). Mitigation: pre-format with `prettier --write` before stage so the displayed diff matches the meaningful change. Or explain in the commit body. **Future:** for doc-heavy fixes, run prettier first; for code fixes, the prettier delta is usually minor.

### 4.4 Phase 4 deploy audit was `.sh`-biased

Audit treated `deploy.sh` as authoritative even though prod runs Windows + `deploy.ps1`. F-FU-3 emerged exactly because of this gap. **Future audit:** Phase 0 scope should explicitly detect target OS (`uname -a` on prod box, or look for `nssm` / `systemctl` in CLAUDE.md). Phase 4.5 (`.ps1` audit) is still owed.

### 4.5 Reply truncation pattern (3+ instances during Step B)

Long agent replies / user instructions got cut at sentence/instruction boundaries. Each truncation cost ~5 min reconstruction. Workaround used: shorter task summaries, split per-fix instructions, fold "predicted commit format" into a known pattern when truncation hit it. **Future:** keep replies under ~5K tokens; if planning a long doc, write to file + reference rather than inline-quote.

### 4.6 Sequential reasoning bias on a "scope-question" message

When user said "convert back grid sidebar về thiết kế sideline", first impulse was to act immediately. Pause → investigate (what does HomePage import? does it depend on the new sidebar plumbing?) caught the `landingTabFor` dependency before any destructive op. **Lesson:** scope questions from user always warrant a 30-second investigation before any `git checkout`.

---

## 5. Lessons for Future Audits

### 5.1 Time budget conventions

| Phase                       | Budget                         | Notes                                                                                   |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Pre-implementation findings | **10-15 min HARD CAP per fix** | Stop at 15 even if discovery feels incomplete; surface unanswered questions in the plan |
| Discovery overhead          | ~20-30% of fix time            | Expect hidden findings; budget the slack                                                |
| Recovery anchor setup       | 5 min before destructive ops   | Tag + tarball; stash optional                                                           |
| Per-fix commit + verify     | ≤30 min                        | If longer, fix is too big — split                                                       |

### 5.2 Commit conventions established

- **Subject:** lowercase, ≤72 chars, `type(scope): brief` (or `type:` if scopeless audit-phase doc)
- **Body:** ≤120 chars/line, structured: P0 marker / closes ID / changes / verification / risk / co-author
- **Scope:** from local commitlint enum (`security`, `platform`, `platform/auth`, `platform/ui-kit`, `release`, `docs`, `tests`, etc.)
- **Reproduction artefacts:** at `/tmp/` (transient, not in repo)
- **Audit-evidence artefacts:** at `docs/audit/screenshots/` (in repo, prefixed `p0-<finding-id>-*`)

### 5.3 Test naming + organization

- `<scope>.<feature>.test.js` — e.g. `authService.timing.test.js`, `auth.login.test.js`
- Pure helpers in `<scope>/utils/` folder so they're testable without booting the server (e.g. `server/utils/envSources.js` → `envSources.test.js`)
- Test-gate noisy boot logs with `if (NODE_ENV !== 'test')` so 1 600+ tests stay readable

### 5.4 Documentation patterns

- **Bilingual EN+VI** for any operator-facing doc (login-retry, MIGRATION_GUIDE, UAT). Mirror structure; translate critical instructions, keep shell commands English.
- **"What you DON'T need to do" subsection** in migration guides (anxiety-reducer; inverts the usual pattern of listing required actions only).
- **Reference commit hashes inline** (e.g. `Closed in 6b8542f`) so future readers can `git show` the actual change.
- **Cross-link adjacent docs** at the bottom (Step B summary ↔ FINAL-REPORT ↔ FIX-6-CLASSIFICATION ↔ STEP-A-verify ↔ STEP-C-uat).

### 5.5 Process patterns

- **Checkpoint after each fix** — never "1-shot all 7 fixes". Mid-stream user input often reframes scope (e.g. user asked for sidebar revert mid-Step-D).
- **Pre-flight findings BEFORE code change** — especially for security-sensitive paths (auth, deploy, env).
- **Side concerns sections** when extra discoveries don't justify scope creep — file as F-FU-N, fix later if cheap, document as known if expensive.
- **Multi-version migration paths** in docs — not just "current → next"; cover the version-jump cases (`v1.2 → v1.5`, `v1.3 → v1.5`, `v1.4 → v1.5`) so any operator can find their starting point.
- **Negative findings are findings** — file the "I checked X, no issue" results so future audits don't re-check.

---

## 6. Open Items + Follow-up Plan

### Deferred work (preserved with recovery anchors)

| Item                                                                                                                     | Files | LOC    | Recovery                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| **B1** — UI redesign sprint S-HOME (Dashboard +484, QuoteAnalysis +406, ModuleLanding NEW, HomePage NEW, sidebar/topbar) | 20    | ~3 000 | git tag `wip-snapshot-20260504-082812` + tarball; sidebar partially reverted via tag `pre-sidebar-revert-20260504-090729` |
| **B2** — Order Entry FG sync + Excel import (matches branch base name)                                                   | 15    | ~1 120 | Same recovery anchors; natural resume on `feature/order-entry-fg-sync-and-import`                                         |

Disposition decision deferred per user request — needs dedicated review session (B1's two largest files alone justify their own pass).

### Follow-up audits scheduled

| Item                                                                                  | Owner                   | When                                                             |
| ------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| **Phase 4.5** — `deploy.ps1` audit (Windows-specific; closes F-FU-3 root-cause class) | DevOps                  | Before next Linux-only assumption is made in tooling             |
| **F-FU-5 verification** — bcrypt → argon2id migration completeness                    | BE                      | 30 days post-deploy; `auditLegacyPasswords()` count = 0 expected |
| **B1 disposition session**                                                            | Frontend lead           | Whenever UI sprint capacity allows                               |
| **B2 resume**                                                                         | Backend + Planning team | Resume on existing feature branch when sprint loads it           |

### Backlog from original audit (not in P0)

- 8 MAJOR items still open (F3-8 BOM perf, F2-3 scrap col, F1-14 Express 5, F1-1 ESLint, F0-1 jest coverage, F0-2 version drift, F0-3 SQLite version drift, F0-4 large-file refactor)
- 24 MINOR items in MES-3 backlog (`CLAUDE.md` § "MES-3 Backlog") + per-fix follow-ups
- Ship across next 1-2 sprints per priority

### Recovery anchors lifetime

- `wip-snapshot-20260504-082812` (Fix 6 pre-WIP) — keep until B1 + B2 disposed (then can `git tag -d`)
- `pre-sidebar-revert-20260504-090729` (sidebar revert) — keep until UI sprint decides direction
- `/tmp/wip-backup-20260504-082812.tar.gz` — `/tmp` cleanup eventually wipes; copy to long-term storage if B1/B2 not disposed within 30 days

---

## Cross-references

- Per-fix evidence: [`STEP-B-fix-summary.md`](STEP-B-fix-summary.md)
- Final audit verdict: [`FINAL-REPORT.md`](FINAL-REPORT.md)
- Step A pre-fix verification: [`STEP-A-verify-f4-5.md`](STEP-A-verify-f4-5.md)
- Fix 6 WIP triage: [`FIX-6-CLASSIFICATION.md`](FIX-6-CLASSIFICATION.md)
- Step C UAT checklist: [`STEP-C-uat-checklist.md`](STEP-C-uat-checklist.md)
- Recovery runbooks: `CLAUDE.md` § "Recovery playbook"
- MES-3 backlog (original-audit MAJOR/MINOR follow-ups): `CLAUDE.md` § "MES-3 Backlog"

**End of Step B retrospective. Audit cycle ✅ closed.**
