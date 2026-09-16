# docs/archive

Material kept for the record, **not** descriptions of how the system works
today. Nothing in here should be followed without re-verifying it first.

## `stashes/`

Seven stashes were exported from a retired build tree (`_ARCHIVE/Ops Control
(old-build 2026-05-30)`, HEAD `998ae7c`) and audited on 2026-06-04 against
main `2771b10`. Six were deleted with a recorded reason; `3.patch` was KEPT
because its work had not shipped. `index.txt` carries that audit in full.

Re-checked 2026-09-16: `client/public/ccl-logo.svg` and `ccl-mark.svg` are
**still absent from the tree**, so the disposition still holds — this is
unshipped work, not a stale duplicate.

When shipping it, follow `index.txt`: cherry-pick the SOURCE files only
(`LoginPage.css`, `LoginPage.jsx`, `Sidebar.jsx`, the two SVGs) and drop the
`releases/v1.5.1/**` `.dmg` / `.blockmap` / `SHA256SUMS` entries — release
artefacts must not enter git.

## `handoffs/`

Session handoff notes from the v1.5.11 / v1.5.12 window and PR #98. Historical
context for decisions taken then; superseded by the sprint history in
`CLAUDE.md` for anything about how the system behaves now.
