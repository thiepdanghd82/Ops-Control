# Local branch cleanup — 2026-09-15

The working copy had accumulated **49 local branches**. All but `main` were
deleted after an audit; this file is the recovery record.

## Recovering one

A deleted branch is just a missing ref — the commits survive in the object
store until git garbage-collects them (roughly 90 days for unreachable
objects, and the merged ones are reachable from `main` forever):

```bash
git branch <name> <sha>
```

## How "safe to delete" was decided

`git branch --merged` is **useless here** — this repository squash-merges, so a
branch's commits never become ancestors of `main` even when the work is fully
landed. Two heuristics were tried and both were wrong:

1. `git diff main...<branch>` being empty — that shows what the branch changed
   relative to its fork point, not whether the work reached `main`.
2. Matching the tip commit's subject against `main` — squash collapses N commits
   into one whose subject is the PR title, so the originals never appear.

What actually settled it: for every branch with a **merged PR**, compare the
local tip against the SHA GitHub merged.

```bash
gh pr view <n> --json headRefOid --jq .headRefOid   # vs  git rev-parse <branch>
```

**41 of 41 matched exactly.** The rest were checked by hand.

## Deleted — work landed via a merged PR (41)

| Branch                                                | Tip SHA   | Merged as |
| ----------------------------------------------------- | --------- | --------- |
| `chore/lint-warning-ratchet`                          | `d481796` | #281      |
| `docs/c4-no-hotspare-decision`                        | `de0b79c` | #195      |
| `docs/carbon-convergence`                             | `a34448f` | #287      |
| `docs/legend-reconcile-calcengine`                    | `d5180aa` | #231      |
| `docs/sprint-history-backfill-rc1-rc6`                | `24db79b` | #137      |
| `docs/sprint-input-warn-and-lesson-32`                | `2d99202` | #140      |
| `docs/sprint-options-field-backfill`                  | `0f87f1d` | #142      |
| `docs/uiux-improvement-plans`                         | `c6a5058` | #283      |
| `docs/v1.6-training-deck`                             | `0a9012d` | #134      |
| `feat/add-row-prefill-above`                          | `2d2ab96` | #256      |
| `feat/calc-validation-on-touch`                       | `5433e63` | #282      |
| `feat/cutter-base-cost-tiers`                         | `8254e96` | #273      |
| `feat/i18n-calc-header`                               | `49c4de0` | #292      |
| `feat/options-field-and-quote-history-column`         | `bd2b3b3` | #138      |
| `feat/quote-progress-v2-dropdown`                     | `9ce6db7` | #147      |
| `feat/server-autostart-bcp`                           | `7ac4825` | #197      |
| `feat/tables-open-maximized`                          | `214e83f` | #286      |
| `fix/client-firstrun-ipc`                             | `2b47d74` | #279      |
| `fix/ifs-inventory-import-mapping`                    | `a9b95f1` | #284      |
| `fix/import-skip-keyless-rows`                        | `c1f5d85` | #285      |
| `fix/ink-calc-row-color-also-white`                   | `0d901be` | #146      |
| `fix/ink-calc-subheader-white-text`                   | `e33fb3b` | #145      |
| `fix/ink-calculator-silkscreen-sync-and-header-color` | `440da0a` | #144      |
| `fix/lint-useless-assignment`                         | `c2fbbb1` | #280      |
| `fix/login-lang-toggle-position`                      | `dd7797e` | #291      |
| `fix/material-lt-include-process-mat`                 | `128ef65` | #222      |
| `fix/maximize-all-non-calculator-tabs`                | `a2434ea` | #289      |
| `fix/maximize-pricing-calculators`                    | `9328289` | #290      |
| `fix/nav-and-i18n-cleanup`                            | `56d0f0b` | #288      |
| `fix/options-inline-with-ul`                          | `5296a0b` | #141      |
| `fix/pdf-rotate-customer-drawing`                     | `1c5f087` | #143      |
| `fix/required-input-warnings`                         | `c837873` | #139      |
| `release/v1.6.0-rc1`                                  | `a24ed73` | #131      |
| `sprint/hero-npi-copy`                                | `186b836` | #152      |
| `sprint/inbox-narrow-dropdown`                        | `4c8b136` | #149      |
| `sprint/npi-showcard-split-pricing`                   | `46a1046` | #151      |
| `sprint/pack-ship-per-tier`                           | `b278789` | #154      |
| `sprint/qh-remove-current-suffix`                     | `e1a1eea` | #148      |
| `sprint/sale-owner-column`                            | `5b99fe0` | #156      |
| `sprint/std-process-uom-col`                          | `926da12` | #150      |
| `sprint/tooling-80pct-eau-cap`                        | `05a66d5` | #153      |

## Deleted — other dispositions (6)

| Branch                               | Tip SHA   | Disposition                                                                           |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------- |
| `feat/cutter-cavities-minprice`      | `4092121` | —                                                                                     |
| `feat/cutter-cost-calc`              | `dec5ea5` | —                                                                                     |
| `feat/quote-validation-ignore-list`  | `2403b96` | deferred 2026-09-15 (Henry decided; helpers usable, WarningBar UI superseded by #282) |
| `fix/installation-id-stable`         | `5e3c446` | superseded-by #326                                                                    |
| `fix/login-screen-remaining-english` | `1ab71b1` | superseded-by #325                                                                    |
| `fix/pre-golive-audit`               | `e9a594e` | obsolete-on-triage 2026-09-15 (all 6 commits already on main or superseded)           |

## Notes on the last four

- **`fix/installation-id-stable`** — the code commit was cherry-picked into #326
  after verifying the claim that hash inputs stayed byte-identical (the new code
  trims the machine-id, the old did not; `node-machine-id` strips all whitespace
  on every platform, so the trim is a no-op). Its CLAUDE.md commit was dropped —
  the sprint history has been restructured since.
- **`fix/login-screen-remaining-english`** — its diff was **deliberately not
  applied**. It added `pwdage.*` keys to `strings.js`, but #288 had since moved
  login keys to `domains/security.js` and added `login.pwd_age_label`, so the
  branch would have introduced a duplicate key. The underlying bug was fixed by
  #325 instead.
- **`fix/pre-golive-audit`** — all six commits obsolete on triage: the duplicate
  `license` key in preload is gone (#105 rewrote it), the five lint errors are
  gone (repo is at 0 errors), the CI Node-22 patch is moot, and the docs it added
  are either already covered or describe a Windows build that is paused.
- **`feat/quote-validation-ignore-list`** — deferred by decision, not obsolete.
  The pure helpers (`validationIgnore.js`, 14 tests) still apply; only the
  `WarningBar.jsx` UI needs redoing against the rewrite in #282. Worth revisiting
  if operators report the warning bar staying red on errors they left on purpose.

---

# Remote branch cleanup — 2026-09-16

The 2026-09-15 pass deleted **local** refs only; all 28 remote heads survived
it. This is the remote half.

## How "safe to delete" was decided, and where it stopped

Same test as last time — compare the remote tip against the SHA GitHub
recorded as merged:

```bash
gh pr view <n> --json headRefOid --jq .headRefOid   # vs  git rev-parse origin/<branch>
```

**20 of 22 matched exactly.** Two did not, and that is the whole reason this
check exists rather than trusting `git branch --merged` or a diff:

| Branch                                 | Remote tip | GitHub merged | Extra commit                                                                 |
| -------------------------------------- | ---------- | ------------- | ---------------------------------------------------------------------------- |
| `feat/pricing-snapshot-phase-4`        | `b63d449`  | `cbcb898`     | `fix(costing): improve SnapshotPanel toggle affordance`                      |
| `sprint/pending-approvals-cols-search` | `d23adc5`  | `a67e11f`     | `feat(costing): reorder inbox cols — rfq after age, quoted-by before status` |

`CLAUDE.md` says both shipped — the S-SNAPSHOT-PHASE-4 entry names `b63d449`
explicitly, and S-INBOX-COLS describes the rc3 column reorder. But grepping
main for the added lines came back **mixed**, because `SnapshotPanel` and
`PendingApprovalsInbox.jsx` were both rewritten by the i18n waves afterwards,
so an exact-line match proves nothing either way.

**So they were kept.** A ref costs nothing; deleting work I cannot prove landed
costs something. "The sprint history says so" is not the same as verifying it.

A `git diff main...<branch>` on these reported _644 files changed_ — the same
meaningless number the 2026-09-15 pass already recorded as a wrong heuristic
under squash-merge. It is noted again only because it is tempting to read as
evidence.

## Deleted — work landed via a merged PR, tip matched exactly (20)

| Branch                                     | Tip SHA   | Merged as |
| ------------------------------------------ | --------- | --------- |
| `chore/lint-warning-ratchet`               | `d481796` | #281      |
| `docs/carbon-convergence`                  | `a34448f` | #287      |
| `docs/uiux-improvement-plans`              | `c6a5058` | #283      |
| `feat/calc-validation-on-touch`            | `5433e63` | #282      |
| `feat/cost-breakdown-whatif`               | `9d090d5` | #221      |
| `feat/cutter-base-cost-tiers`              | `8254e96` | #273      |
| `feat/draggable-modals-lessons`            | `f3a57b3` | #220      |
| `feat/i18n-calc-header`                    | `49c4de0` | #292      |
| `feat/materials-mats-per-moq`              | `d272446` | #218      |
| `feat/process-crew-driven-labor`           | `487e1b8` | #217      |
| `feat/remove-import-legacy-restore-picker` | `41ffcdf` | #219      |
| `feat/tables-open-maximized`               | `214e83f` | #286      |
| `fix/client-firstrun-ipc`                  | `2b47d74` | #279      |
| `fix/ifs-inventory-import-mapping`         | `a9b95f1` | #284      |
| `fix/import-skip-keyless-rows`             | `c1f5d85` | #285      |
| `fix/lint-useless-assignment`              | `c2fbbb1` | #280      |
| `fix/login-lang-toggle-position`           | `dd7797e` | #291      |
| `fix/maximize-all-non-calculator-tabs`     | `a2434ea` | #289      |
| `fix/maximize-pricing-calculators`         | `9328289` | #290      |
| `fix/nav-and-i18n-cleanup`                 | `56d0f0b` | #288      |

## Deleted — other dispositions (3)

| Branch                               | Tip SHA   | Disposition                                |
| ------------------------------------ | --------- | ------------------------------------------ |
| `chore/sync-version-1.5.9`           | `7b9b35d` | obsolete — bumps to 1.5.9; repo is 1.6.0   |
| `fix/login-screen-remaining-english` | `1ab71b1` | superseded-by #325 (per 2026-09-15 record) |
| `fix/pre-golive-audit`               | `e9a594e` | obsolete-on-triage (per 2026-09-15 record) |

## Kept (4)

| Branch                                 | Tip SHA   | Why                                                                                                                                                         |
| -------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat/quote-validation-ignore-list`    | `2403b96` | deferred by decision 2026-09-15, not obsolete                                                                                                               |
| `keep/stash-0-anti-flash-ink`          | `096fdfc` | the `keep/` prefix is somebody's deliberate preservation; its content overlaps a stash another audit called already-shipped, but not provably the same work |
| `feat/pricing-snapshot-phase-4`        | `b63d449` | tip ≠ merged SHA, extra commit unproven (above)                                                                                                             |
| `sprint/pending-approvals-cols-search` | `d23adc5` | tip ≠ merged SHA, extra commit unproven (above)                                                                                                             |

## Recovering one

Unchanged from the section above — the commits survive in the object store,
and for the merged ones they are reachable from `main` forever:

```bash
git fetch origin <sha>
git branch <name> <sha>
```
