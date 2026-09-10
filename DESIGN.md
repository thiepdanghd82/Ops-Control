# Design System — IBM Carbon

The shipping visual language of Ops Control is **IBM Carbon**. It is what the
app chrome, the login screen, and every operator-facing desktop dialog already
use; it is what new UI must use.

An earlier Apple-inspired specification was never built and is archived at
[`docs/design/ARCHIVED-2026-09-10-apple-design-system.md`](docs/design/ARCHIVED-2026-09-10-apple-design-system.md).
Do not build to it.

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

Two naming rules the scale depends on:

- `--color-slate-*` and `--color-gray-*` carry the **real Tailwind values**.
  If you need a colour that is not one of them, do not reuse a scale name for
  it — that makes the whole ramp untrustworthy for the next reader.
- Brand colours are named for the brand, not for a scale they do not belong
  to. `--color-brand-navy` (`#0f2341`) is the CCL navy that consolidated four
  near-navy hexes; it was called `--color-slate-900` until 2026-09-10, which
  made every other slate token suspect.

## Rules for new UI

1. **No hardcoded hex.** Use `var(--token)`. If no token fits, add one to
   `tokens.css` with a comment saying what it is for — do not inline it.
2. **No `style={{...}}`.** ESLint warns on it (`no-restricted-syntax`) and CI
   enforces a warning budget that may only ever go down. A PR that raises the
   budget is a PR that added debt.
3. **Never colour alone.** Error and warning states need a border, an icon or
   text as well. Operators use this on cheap floor panels and some are
   colour-blind.
4. **Every user-facing string goes through `t()`.** `strings.lint.test.js`
   enforces that both locales exist. This is why i18n has stayed healthy while
   the token migration stalled — enforcement, not good intentions.

## The migration

965 inline styles and 768 hardcoded hexes predate these rules — roughly 9:1
against the 87 `var(--token)` uses in JSX, measured 2026-09-10. They are not
being fixed in one sweep; a mass restyle would be an unreviewable diff.

The CI warning budget in `.github/workflows/ci.yml` is a **ratchet**: lower it
whenever you migrate a file, never raise it. That turns the debt into something
that shrinks as files are touched instead of a permanent floor.
