import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Allow capitalised + underscore-prefixed identifiers to be unused.
      // Capitalised covers JSX-component params destructured under a
      // rename like `tag: Tag = 'p'` — without `eslint-plugin-react`,
      // ESLint can't see that `<Tag>` is a usage; the regex carves out
      // the convention so we don't have to disable per-line.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
  // Sprint 11 quick-win: flag NEW inline-style usage so we don't add
  // more than the existing 600+ across 15 files. WARNING, not error —
  // existing code keeps compiling but every new `style={{...}}` lights
  // up in IDE + CI output. Top-5 offenders are excluded here until
  // Sprint 12 migrates them to CSS classes.
  //
  // The rule matches only OBJECT LITERALS: `style={someVar}` still
  // compiles clean because computed styles are often genuinely dynamic
  // (e.g. chart colors). If you need a literal, hoist it to a
  // component-level `const` outside the render to document intent.
  {
    files: ['src/**/*.jsx'],
    ignores: [
      // Top-5 offenders being migrated in Sprint 12.
      'src/modules/cost/tabs/InkCalculator.jsx',
      'src/modules/cost/tabs/Settings.jsx',
      'src/modules/cost/tabs/ComplexCalc/SubProductRow.jsx',
      'src/modules/cost/tabs/PrintAreaCalc.jsx',
      'src/modules/cost/tabs/Dashboard.jsx',
      // Legacy heavy offenders (>20 usages) — migrate opportunistically.
      'src/modules/cost/tabs/LibFinance.jsx',
      'src/modules/cost/tabs/ComplexCalc/BomTreeView.jsx',
      'src/modules/cost/tabs/MaterialLibrary.jsx',
      'src/modules/cost/tabs/QuoteHistory.jsx',
      'src/modules/cost/tabs/PendingApprovalsInbox.jsx',
      'src/modules/cost/tabs/QuoteAnalysis.jsx',
      'src/modules/cost/tabs/ComplexCalc/ComplexCalc.jsx',
      'src/modules/cost/tabs/StandardCalc/CalcCostBreakdown.jsx',
      'src/modules/cost/tabs/ComplexCalc/CplxCostBreakdown.jsx',
      'src/modules/cost/tabs/StandardCalc/CalcProcesses.jsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression",
          message:
            'Inline style={{...}} discouraged — move to a CSS class or a component-level const. ' +
            'See CLAUDE.md "Lessons learned" for the migration plan.',
        },
      ],
    },
  },
])
