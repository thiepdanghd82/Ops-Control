# Lint Warning Ratchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the inline-style / lint debt from growing silently by lowering the CI warning budget to today's actual count.

**Architecture:** One-line change to `.github/workflows/ci.yml`. The budget becomes a ratchet — it may only ever be lowered, never raised. No application code changes.

**Tech Stack:** GitHub Actions, ESLint 10.2.1, Node 22 (CI) / Node 24 (local).

**Spec:** UI/UX audit findings, 2026-09-10 (this session). Finding: design system is opt-in and stalled — 965 `style={{`, 768 hardcoded hexes vs 87 `var(--token)` in JSX.

## Global Constraints

- **CI Node version is 22. Local is 24. They report different warning counts.** `ci.yml` already documents this: _"Local Node 24 reports ~366 warnings; CI Node 22 reports ~432 due to V8 / @eslint/js control-flow analysis differences. Source of truth is CI count, not local."_
- **Never set the budget from a local `npx eslint .` run.** Local under-reports (353 vs CI's 413 on the same commit). Read the number off a CI run.
- This plan assumes PR #280 (`fix/lint-useless-assignment`) is merged. Before it, CI reports `414 problems (1 error, 413 warnings)` and the job fails on the error regardless of budget.
- `--max-warnings` governs warnings only. Errors always fail the job.

---

### Task 1: Lower the budget to the current CI count

**Files:**

- Modify: `.github/workflows/ci.yml:64`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing. This is a CI configuration change with no runtime surface.

- [ ] **Step 1: Read the real warning count off a green CI run**

Do not run ESLint locally for this number. Get it from the most recent CI run on `main` after PR #280 merged:

```bash
RID=$(gh run list --branch main --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RID" --log | grep -E "✖ [0-9]+ problems"
```

Expected output shape: `✖ 413 problems (0 errors, 413 warnings)`

If the line reads `(1 error, ...)`, PR #280 is not merged yet — stop and merge it first.

- [ ] **Step 2: Verify the current budget is higher than that count**

```bash
grep -n "max-warnings" .github/workflows/ci.yml
```

Expected: `- run: npm run lint -- --max-warnings 435`

435 − 413 = 22 warnings of headroom. That headroom is the bug: debt can grow by 22 before anyone notices.

- [ ] **Step 3: Set the budget to the exact current count**

In `.github/workflows/ci.yml`, change the `--max-warnings` value from `435` to the number from Step 1 (`413` at time of writing), and replace the explanatory comment block above it with:

```yaml
# RATCHET — this number may only ever go DOWN, never up.
# It is the exact CI warning count as of the commit that set it.
# CI Node 22 and local Node 24 disagree (V8 / @eslint/js control-flow
# analysis differences), so ALWAYS read this number off a CI run,
# never off a local `npx eslint .`. Local under-reports by ~60.
# 303 of these are inline `style={{...}}` (no-restricted-syntax) —
# the stalled design-token migration. Lower this number as files
# migrate; a PR that raises it is a PR that added debt.
- run: npm run lint -- --max-warnings 413
```

- [ ] **Step 4: Verify the change is exactly one value**

```bash
git diff .github/workflows/ci.yml
```

Expected: only the `--max-warnings` number and the comment block above it changed. No other job, step, or file touched.

- [ ] **Step 5: Commit**

```bash
git checkout -b chore/lint-warning-ratchet
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
chore(ci): ratchet lint budget from 435 to the actual CI count

--max-warnings sat at 435 while CI reported 413, leaving 22 warnings of
headroom for debt to grow without failing the job. 303 of the 413 are
inline style={{...}} from the stalled design-token migration, so the
headroom was actively working against that migration.

Set the budget to the exact current CI count and document it as a
ratchet: lower it as files migrate, never raise it. The comment records
why the number must come from CI (Node 22) and not from a local run
(Node 24 under-reports by ~60 due to control-flow analysis differences).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push and confirm CI still passes at the new budget**

```bash
git push -u origin chore/lint-warning-ratchet
gh pr create --base main --fill
gh pr checks --watch
```

Expected: `Lint + format` **pass**. If it fails with `too many warnings`, the count from Step 1 was stale — re-read it from this PR's own failing log and use that number instead.
