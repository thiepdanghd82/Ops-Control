# CI fix — Node-22 server tests red (better-sqlite3 ABI)

**Status:** prepared here as a patch, **NOT applied to `.github/workflows/ci.yml`**
on this branch — the audit token lacks GitHub `workflow` scope, so it can't push
workflow edits. Apply this on GitHub web (the editor has workflow permission) or
with a `workflow`-scoped token / by the repo owner.

## Root cause (verified)

The `Server tests` CI job runs on **Node 22**; locally the suite is green on
Node 24. Reproduced on Node 22: the native **better-sqlite3** binary didn't match
the runner's Node ABI, so every DB-touching test threw
`TypeError: Cannot read properties of undefined (reading 'close')` (the DB handle
is undefined because the `.node` module failed to load) — **228 failures**.
After `npm rebuild better-sqlite3` under Node 22 the **same suite passes
1246/1246**. So this is an environment/ABI issue, **not a product or test bug**.

## The fix

Add one step to the `test-server` job, right after `npm ci`:

```diff
@@ jobs.test-server.steps @@
       - run: npm ci
+      # better-sqlite3's native binary must match this job's Node ABI, else
+      # every DB test throws "Cannot read properties of undefined (reading
+      # 'close')". Verified: rebuilt → 1246/1246 pass on Node 22.
+      - run: npm rebuild better-sqlite3
       - run: cd apps/kiosk && npm ci
       - run: npm test
       - run: cd desktop && npm ci && npm run test:license && npm run test:manifest
```

## Apply

1. GitHub → repo → `.github/workflows/ci.yml` → ✏️ Edit.
2. In the **`test-server`** job, insert `- run: npm rebuild better-sqlite3`
   immediately after the `- run: npm ci` line.
3. Commit to `fix/pre-golive-audit` (or main per your flow).

> Alternatively, pin the CI Node version to match the prebuilt binary, but an
> explicit rebuild is the most robust — it always matches whatever Node the
> runner uses.
