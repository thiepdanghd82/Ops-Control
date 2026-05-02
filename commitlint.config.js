/**
 * commitlint config — enforces Conventional Commits.
 *
 * Run automatically by:
 *   - .husky/commit-msg hook        (rejects bad commit at typing time)
 *   - .github/workflows/ci.yml      (re-validates on PR)
 *
 * Rules: see https://commitlint.js.org/reference/rules — defaults from
 * @commitlint/config-conventional give us the standard Angular taxonomy:
 *
 *   feat        — new user-facing capability
 *   fix         — bug fix
 *   refactor    — internal restructuring (no behaviour change)
 *   perf        — performance improvement
 *   test        — adds / fixes tests only
 *   docs        — README, ADRs, runbooks
 *   chore       — tooling, deps, build glue
 *   ci          — CI workflow / pipeline tweaks
 *   build       — build-system / packaging
 *   style       — whitespace / formatter only
 *   revert      — revert a prior commit
 *
 * Customisations layered on top:
 *   - subject-max-length 100 (Angular default 72 too tight for our scopes)
 *   - body-max-line-length 120 (cleanly fits one screen of git log)
 *   - scope-enum locks to our SAP domain letters + platform packages
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
    'scope-enum': [
      2,
      'always',
      [
        // SAP-aligned domains (server/domains/*)
        'costing',
        'library',
        'sales',
        'planning',
        'quality',
        'security',
        'basis',
        'mes',
        // Platform packages (cross-cutting; no business logic)
        'platform',
        'platform/auth',
        'platform/audit',
        'platform/cache',
        'platform/sync',
        'platform/i18n',
        'platform/ui-kit',
        'platform/http',
        'platform/storage',
        'platform/observability',
        // Apps shells
        'apps',
        'apps/server',
        'apps/client',
        'apps/desktop',
        // Tooling / non-domain scopes
        'ci',
        'deps',
        'docs',
        'tests',
        'release',
      ],
    ],
    // Subject style — keep imperative present tense ("add", not "added")
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    // v1.3 K4 — body must end with a blank line before any trailer
    // (Co-Authored-By, Reviewed-By, Refs, Fixes). Standard git
    // trailer convention; without the blank line `git interpret-trailers`
    // misparses and tooling that consumes commit history breaks.
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    // Limit subject prefix-noise — we've seen "feat:" being added to
    // body/footer sections by mistake. 1 type per commit.
    'type-empty': [2, 'never'],
    'type-case': [2, 'always', 'lower-case'],
    'scope-empty': [1, 'never'], // warn if missing — not always required
    // 'subject' must NOT end with a period (Angular convention).
    'subject-full-stop': [2, 'never', '.'],
  },
};
