---
trigger: always_on
description: Auto-run the security-audit skill (guidance mode) on every coding-loop iteration.
---

# Security review — runs automatically in every coding loop

Skill: `.agents/skills/security-audit/SKILL.md` (source `cloudflare/security-audit-skill`, tracked in
`skills-lock.json`). Henry's standing request: this review runs **on its own** in every code-change loop —
do not wait to be asked.

## When

In every iteration of the loop (CLAUDE.md "MANDATORY checklist" / verify-loop), **after tests are green and
before rebuild, commit or PR**. Re-run it if the fix for a finding changes code.

Scope = the diff of this iteration (`git diff` + staged + new files). Always review when the diff touches any of:

- `server/**` — routes, auth / `requireTabAccess`, SQL, file I/O, uploads, exports, Express bind/CORS
- `desktop/**` — Electron main, preload, IPC, `nodeIntegration` / `contextIsolation`, Setup Wizard / First-Run
- `client/**` code that handles HTML rendering, URLs, tokens, storage, or data from the server
- `package.json` / lockfiles, `scripts/**`, `deploy/**`, installers, `.env*`, `security-allowlist.json`

Docs-only, CSS-only or test-only diffs: skip and write one line `Security review: skipped (<reason>)`.

## How

1. Load the skill in **guidance mode** (focused review of the diff). Read only the reference files relevant to
   the touched surface — e.g. `DESKTOP-MOBILE-AND-LOCAL-IPC.md` for Electron, `WEB-PROTOCOL-AND-AUTH.md` for
   Express routes, `SUPPLY-CHAIN-AND-RELEASE.md` for dependency / build changes.
2. Source-first and read-only. Follow the skill's execution-safety rules: no probing the live server on this box,
   never touch the live `DATA_DIR` (prod-data-safety), no dependency installs for the review.
3. Do **not** create audit output directories or report files in this loop. Full audit mode runs only when Henry
   explicitly asks for a full audit / pen test; its output goes outside the repo (skill default
   `~/security-audit-skill/Ops-Control/run-N`) or into a git-ignored folder he names.

## Result and gate

Add a short **Security review** block to the loop report: surfaces checked, then each finding with
file:line, affected principal / resource, severity, and the smallest fix — or `no findings`.

- **Confirmed Critical / High** → blocking. Fix, re-run tests and this review, then continue.
- **Medium / Low / needs-validation** → do not block; list them and ask Henry whether to fix now or log them in
  `audit/` findings.
