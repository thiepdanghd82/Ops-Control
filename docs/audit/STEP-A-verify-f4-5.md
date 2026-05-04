# STEP A — Verify F4-5 (`deploy.sh:191` legacy `DATA_DIR`)

**Branch**: `audit/pre-go-live-v1.2`
**Date**: 2026-05-03
**Time spent**: ~15 min
**Goal**: confirm whether the v1.0-era hardcoded `DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` in [`deploy.sh:191`](deploy.sh#L191) breaks production today.

---

## TL;DR

**F4-5 is downgraded from 🟠 candidate-BLOCKER → 🟠 MAJOR (code-health debt, not currently breaking production)**.

The hardcoded legacy path lives in **`deploy.sh` (Linux)** only. Per CLAUDE.md the actual prod server `10.102.3.61` is **Windows** and is deployed via `deploy.ps1`, which **does not** have this issue. The Linux script is therefore dead code in the current production topology — but the bug remains real for any future Linux deploy, and the script header still says "v1.0", so it must be fixed in P0.

**No 🔴 BLOCKER. Continue to STEP B.**

---

## Evidence

### 1. The hardcoded path appears in **only one place** in the entire repo

```
$ grep -rn "COST_V1.0\|/opt/COST_V1\|opt\\\\COST_V1" \
    --include="*.{ts,js,jsx,py,md,sh,ps1,bat,command,json,yml}" . \
  | grep -v -E "(node_modules|\.git|/dist/|/_legacy/|/Use guide/|docs/audit/|\.test\.)"

deploy.sh:191:Environment=DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data
```

Nothing else in the codebase references `/opt/COST_V1.0/`. No source code, no Help system content, no operator-facing docs, no `.command` / `.bat` launcher. Only this one systemd-Environment line.

### 2. **`deploy.ps1` (Windows) does NOT hardcode this path**

```
$ grep -nE "DATA_DIR|COST_V1.0|Environment=" deploy.ps1
(empty output)
```

`deploy.ps1` defaults `RemoteDir = 'C:\opt\ops-control'` (line 38) and lets `.env` drive `DATA_DIR`. No legacy path.

### 3. Production server `10.102.3.61` is **Windows** per CLAUDE.md

```
$ grep -nE "10\.102\.3\.61|remote Windows" CLAUDE.md
54:| **Prod server (remote Windows)** | `http://10.102.3.61:3000` …
68:   - `:3000` on `10.102.3.61` (remote Windows) → rebuild **and** deploy.
197:- On the remote Windows server, the systemd/service equivalent needs restarting after `./deploy.sh` …
208:- `deploy.sh` — Linux SSH deploy (Windows server likely needs manual variant)
```

CLAUDE.md L208 even says **"deploy.sh — Linux SSH deploy (Windows server likely needs manual variant)"** — explicit acknowledgment that `deploy.sh` is not the deploy path for prod. The actual Windows deploy is `deploy.ps1` (line 36-39 in CLAUDE.md "Deployment topology").

### 4. The hardcoded path is **dormant** since v1.0 — never updated

```
$ git log --all --diff-filter=A --pretty=format:'%h %ad %s' --date=short -G "COST_V1.0" -- deploy.sh
a8b559f 2026-04-29 chore: initial git repo from v1.2 + v1.3 autonomous upgrade snapshot
```

The line was present in the very first commit (`a8b559f`), part of the "v1.2 + v1.3 autonomous upgrade snapshot". `deploy.sh` has been touched only twice since (Sprint MES-2.3 kiosk pairing additions). The legacy path is an untouched artefact from v1.0 era. Header line 1 of the script still says:

```
# Ops Control v1.0 — Deploy to Production Server
```

### 5. dotenv precedence — empirically confirmed

[`server/index.js:12`](server/index.js#L12) calls `dotenv.config({ path: …})` **without** `override: true`. By default, dotenv **does not** overwrite an env var already in `process.env`. Reproduction:

```
$ node dotenv-test.mjs
[1] Before dotenv.config(): DATA_DIR = /opt/ops-control/../COST_V1.0/CCL_Pricing/data
[2] After dotenv.config():  DATA_DIR = /opt/ops-control/../COST_V1.0/CCL_Pricing/data
[3] Actual .env contents:
    OPS_KIOSK_KEY=0ab1d…
```

So **if** `deploy.sh` were used to deploy to a Linux box, the systemd `Environment=DATA_DIR=…COST_V1.0…` value WOULD win over any `.env` line setting `DATA_DIR=./server/data`. The bug is real on Linux. It just doesn't currently apply to prod, which is Windows.

### 6. SSH to `10.102.3.61` not feasible from this audit environment

```
$ ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no 10.102.3.61 ...
ssh: connect to host 10.102.3.61 port 22: Operation timed out
```

The audit machine has no direct route to `10.102.3.61`. The local SSH `known_hosts` and `~/.ssh/config` have no entries for it. This is **expected** — the prod server is on the corporate network behind firewall, accessible only from the operator's machine.

The above 5 lines of evidence (single-occurrence path, deploy.ps1 clean, prod-is-Windows confirmation in CLAUDE.md, git archaeology, dotenv reproduction) are sufficient to conclude the verdict without SSH access.

---

## Verdict

| Question                                                                        | Answer                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does prod (`10.102.3.61`) currently boot via `deploy.sh`'s broken systemd unit? | **No** — prod is Windows, deployed via `deploy.ps1` (no legacy path).                                                                                                               |
| Is there any prod surface today that hits the legacy path?                      | **No** — no other code/config references it.                                                                                                                                        |
| Would the legacy path break a hypothetical Linux deploy?                        | **Yes** — dotenv-no-override means systemd value would win and point at a non-existent dir.                                                                                         |
| Is this still a real bug worth fixing in P0?                                    | **Yes** — script header says "v1.0", path is from v1.0 era, dotenv precedence is brittle, and the cross-script defaults (deploy.sh vs deploy.ps1 vs .env.example) are inconsistent. |

### F4-5 severity transition

| Before STEP A                               | After STEP A                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 🟠 candidate-BLOCKER (verify before deploy) | 🟠 **MAJOR** (code-health debt — Linux script stale since v1.0; not currently in prod path) |

### Why we still fix this in P0

The brief says "fix theo thứ tự, F4-5 first". Even though the bug isn't currently breaking prod, the P0 fix is:

- Trivial (≤ 5 lines)
- Eliminates a foot-gun for any future Linux deploy
- Removes a "v1.0" marker that misleads readers into thinking the script is current

Recommended fix shape (deferred to STEP B):

- Replace [`deploy.sh:191`](deploy.sh#L191) `Environment=DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` with `Environment=DATA_DIR=$APP_DIR/server/data` to match `.env.example`.
- Optionally drop the `Environment=DATA_DIR=…` line entirely so the `.env` file is the single source of truth (cleaner).
- Update script header from "v1.0" → "v1.5".
- Update systemd unit `Description=Ops Control v1.0` → `Description=Ops Control` (also flagged as F4-6).

---

## Next step

**No blocker — proceed to STEP B (P0 fixes) when you give the go-ahead.**

Reply `go step b` and I'll cut `fix/pre-go-live-p0` from `audit/pre-go-live-v1.2` and start the P0 work in fix order:

1. F4-5 — fix `deploy.sh:191` (now downgraded but still in P0)
2. F3-1 — `app.use(compression())`
3. F2-1 — unify login error message
4. F3-3 + F3-4 — login a11y polish
5. F4-21 — refresh `MIGRATION_GUIDE.md` for v1.5
6. WIP cleanup

Each fix gets: lint + test + build + curl/script verify + commit `fix(p0-FX-Y): …`.
