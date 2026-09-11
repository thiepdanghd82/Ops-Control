# Carbon Convergence Implementation Plan

> **STATUS: SHIPPED — do not re-execute.** Shipped 2026-09-10 — PR #287 (`73e4a1f`). Carbon is the canonical design language; the Apple spec is archived and `--color-brand-navy` no longer masquerades as a slate.
>
> Every box below is ticked because the work is on `main`, not because someone walked the plan a second time. Read it as a record of what was decided and why.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave exactly one documented visual language in the repo, and stop a token whose name contradicts its value from misleading the next contributor.

**Architecture:** No component is restyled. This wave removes the _sources of confusion_ that make new UI drift: a design document nobody follows, and a token named after a palette it no longer belongs to. The 965 inline styles are not migrated here — the ratchet from wave 0 already makes them shrink instead of grow, and a mass restyle would be an unreviewable diff.

**Tech Stack:** CSS custom properties, Markdown.

**Spec:** UI/UX audit findings, 2026-09-10 (this session). Measured on `client/src`: **965** `style={{`, **768** hardcoded hex colours, **87** `var(--token)` uses in JSX — roughly 9:1 against the token system. The top repeated hexes mix two palettes: IBM Carbon (`#525252`, `#e0e0e0`, `#0f62fe`) and Tailwind (`#7c3aed`, `#1e40af`, `#94a3b8`, `#dc2626`, `#16a34a`, `#fef3c7`), while `DESIGN.md` documents a third — Apple.

## Global Constraints

- **Carbon is the canonical language.** Confirmed by the operator, 2026-09-10. The app chrome and every operator-facing desktop dialog are already Carbon; choosing Apple would mean redrawing all of it.
- **Do not restyle components in this wave.** No `style={{` removals, no colour swaps in JSX. Those belong to the ratchet's gradual squeeze.
- **`DESIGN.md` is history, not a lie to be deleted.** It records a real decision that was made and abandoned. Archive it with a note; do not rewrite it to pretend Carbon was always the plan.
- **A token rename must be complete in one commit.** A half-renamed token is worse than a misnamed one.
- Run: `cd client && node --test 'src/**/*.test.js'`, then `npx prettier --check` on touched files.

---

### Task 1: Retire the Apple design document

**Files:**

- Create: `docs/design/ARCHIVED-2026-09-10-apple-design-system.md` (moved content)
- Delete: `DESIGN.md`
- Create: `DESIGN.md` (new, short, Carbon)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing consumed by later tasks.

A design document nobody follows is worse than none: a new contributor reads it, builds to the Apple spec in good faith, and creates a **fourth** visual language.

- [x] **Step 1: Move the existing document to the archive**

```bash
mkdir -p docs/design
git mv DESIGN.md docs/design/ARCHIVED-2026-09-10-apple-design-system.md
```

- [x] **Step 2: Mark the archived file as superseded**

Insert at the very top of `docs/design/ARCHIVED-2026-09-10-apple-design-system.md`, above the existing `# Design System Inspired by Apple` heading:

```markdown
> **ARCHIVED 2026-09-10 — this document does not describe the shipping app.**
>
> It specifies an Apple-inspired system: pure black / `#f5f5f7` section
> rhythm, Apple Blue `#0071e3`, SF Pro, 980px pill CTAs. The app was never
> built this way. The shipping UI is IBM Carbon — navy chrome, square
> corners, IBM Plex Mono, `#0f62fe` — and so is every operator-facing
> desktop dialog.
>
> Kept because it records a real decision that was made and set aside, not
> because it is a target. The canonical language is in `DESIGN.md`.
> See `docs/superpowers/plans/2026-09-10-wave3-carbon-convergence.md`.
```

- [x] **Step 3: Write the replacement DESIGN.md**

Create `DESIGN.md`:

```markdown
# Design System — IBM Carbon

The shipping visual language of Ops Control is **IBM Carbon**. It is what
the app chrome, the login screen, and every operator-facing desktop dialog
already use; it is what new UI must use.

An earlier Apple-inspired specification was never built and is archived at
`docs/design/ARCHIVED-2026-09-10-apple-design-system.md`. Do not build to it.

## Where the values live

Tokens are CSS custom properties, defined in three files loaded in this order:

| File                                    | Holds                                         |
| --------------------------------------- | --------------------------------------------- |
| `client/src/styles/tokens.css`          | raw values — colours, spacing, font sizes     |
| `client/src/styles/semantic-tokens.css` | component classes that reference those values |
| `client/src/styles/table-pro.css`       | the data-table system                         |

**Read a token before inventing a colour.** `tokens.css` records how many
places already use each value, so the comments tell you which token is the
established answer for borders, muted text, headings and so on.

## Rules for new UI

1. **No hardcoded hex.** Use `var(--token)`. If no token fits, add one to
   `tokens.css` with a comment saying what it is for — do not inline it.
2. **No `style={{...}}`.** ESLint warns on it (`no-restricted-syntax`) and
   CI enforces a warning budget that may only ever go down. A PR that
   raises the budget is a PR that added debt.
3. **Never colour alone.** Error and warning states need a border, an icon
   or text as well. Operators use this on cheap floor panels, and some are
   colour-blind.
4. **Every user-facing string goes through `t()`.** `strings.lint.test.js`
   enforces that both locales exist. This is why i18n has stayed healthy
   while the token migration stalled — enforcement, not good intentions.

## The migration

965 inline styles and 768 hardcoded hexes predate these rules. They are not
being fixed in one sweep. The CI warning budget in `.github/workflows/ci.yml`
is a ratchet: lower it whenever you migrate a file, never raise it.
```

- [x] **Step 4: Check nothing still points at the old path**

```bash
grep -rn "DESIGN\.md" --include="*.md" --include="*.js" --include="*.jsx" --include="*.json" . \
  | grep -v node_modules | grep -v docs/design/ARCHIVED
```

Expected: any hit is either the new `DESIGN.md` itself or a reference that still reads correctly. Fix any link that meant the Apple content — it now lives under `docs/design/`.

- [x] **Step 5: Verify formatting**

Run: `npx prettier --check DESIGN.md docs/design/ARCHIVED-2026-09-10-apple-design-system.md`
Expected: `All matched files use Prettier code style!`

- [x] **Step 6: Commit**

```bash
git add -A DESIGN.md docs/design/
git commit -m "$(cat <<'EOF'
docs: make Carbon the canonical design language, archive the Apple spec

DESIGN.md documented an Apple-inspired system — black/#f5f5f7 rhythm,
Apple Blue #0071e3, SF Pro, 980px pill CTAs — that the app was never
built to. The shipping UI is IBM Carbon, and so is every operator-facing
desktop dialog.

A design document nobody follows is worse than none: a new contributor
reads it, builds to it in good faith, and adds a fourth visual language
on top of the Carbon and Tailwind palettes already mixed in the code.

Archives the Apple spec with a note saying why, and replaces DESIGN.md
with a short Carbon document that points at the real token files and
states the four rules new UI must follow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rename the token whose name contradicts its value

**Files:**

- Modify: `client/src/styles/tokens.css:31` and the consolidation note at line ~161
- Modify: every file that references `--color-slate-900` (11 files at time of writing)

**Interfaces:**

- Consumes: nothing.
- Produces: `--color-brand-navy` replaces `--color-slate-900` everywhere. Nothing later depends on it.

`--color-slate-900` is `#0f2341`. Tailwind's slate-900 is `#0f172a`. The value is a deliberate brand navy that consolidated four near-navy hexes (`#0e2550`, `#162c52`, `#243352`, `#1a3a5c` — recorded in the file's own consolidation note). The value is right; the **name** is wrong, and anyone reading the slate scale will assume Tailwind values and get a different colour.

- [x] **Step 1: Record the exact before-state**

```bash
grep -rn "color-slate-900" --include="*.css" --include="*.jsx" --include="*.js" client/src | wc -l
grep -rl "color-slate-900" --include="*.css" --include="*.jsx" --include="*.js" client/src
```

Write the count down. Step 4 asserts it reaches zero and the new name reaches the same count.

- [x] **Step 2: Rename the definition**

In `client/src/styles/tokens.css`, replace line 31:

```css
/* Brand navy. NOT Tailwind slate-900 (#0f172a) — this is a deliberate
     CCL navy that consolidated #0e2550, #162c52, #243352 and #1a3a5c.
     Named slate-900 until 2026-09-10, which made the whole slate scale
     read as Tailwind when one value was not. 34 uses — headings, dark titles. */
--color-brand-navy: #0f2341;
```

Update the consolidation note further down the same file (around line 161) so it names the new token:

```
 *   #0e2550, #162c52, #243352, #1a3a5c  → --color-brand-navy
```

- [x] **Step 3: Rename every reference**

```bash
grep -rl "color-slate-900" --include="*.css" --include="*.jsx" --include="*.js" client/src \
  | xargs sed -i '' 's/--color-slate-900/--color-brand-navy/g'
```

On GNU sed drop the `''` after `-i`.

- [x] **Step 4: Verify the rename is complete**

```bash
grep -rn "color-slate-900" --include="*.css" --include="*.jsx" --include="*.js" client/src | wc -l   # expect 0
grep -rn "color-brand-navy" --include="*.css" --include="*.jsx" --include="*.js" client/src | wc -l  # expect the Step 1 count
```

A non-zero first number means a half-rename — worse than the original problem. Do not proceed until it is zero.

- [x] **Step 5: Verify the app still builds and looks unchanged**

Run: `cd client && npm run build`
Expected: `✓ built`, exit 0.

Run: `cd client && node --test 'src/**/*.test.js'`
Expected: PASS.

This task changes no colour values, so the rendered UI must be pixel-identical. If anything looks different, a reference was missed or a fallback (`var(--color-slate-900, #something)`) was silently picking up its fallback — search for the old name once more.

- [x] **Step 6: Commit**

```bash
git add client/src
git commit -m "$(cat <<'EOF'
refactor(apps/client): rename --color-slate-900 to --color-brand-navy

The token holds #0f2341. Tailwind's slate-900 is #0f172a. Every other
--color-slate-* in tokens.css is a genuine Tailwind value, so one entry
named slate-900 that is not slate-900 makes the whole scale untrustworthy
— a reader reasonably assumes the documented Tailwind ramp and picks a
different colour than they see.

The value is correct and deliberate: it consolidated #0e2550, #162c52,
#243352 and #1a3a5c, as the file's own note records. Only the name was
wrong. Renamed at the definition and at every reference in one commit;
no colour value changed, so the rendered UI is identical.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** The audit's design-system finding has three parts. "Three design languages" → Task 1 removes the Apple source and names Carbon canonical. "A token that lies" → Task 2. "The system is opt-in so it stalled" → wave 0's ratchet, already merged as #281; the new `DESIGN.md` documents it as a rule rather than a suggestion.

**Placeholder scan.** No TBD, no vague instructions. Every command and every document body is written out.

**Type consistency.** Only one identifier changes name, `--color-slate-900` → `--color-brand-navy`, and Task 2 Step 4 asserts the rename is total.

**Deliberately out of scope.** The 965 inline styles and 768 hardcoded hexes. Migrating them is a mechanical sweep with an unreviewable diff and real regression risk; the ratchet makes them shrink as files are touched. Any PR that tries to do it wholesale should be split per module instead.
