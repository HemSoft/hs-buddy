/* global process */
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'

// Quality gate rules activate via: ESLINT_QUALITY=1 eslint .
// They produce warnings that would break --max-warnings 0, so they only
// run in the lint:quality script. Graduate to always-on once violations hit 0.
const isQualityMode = process.env.ESLINT_QUALITY === '1'
const qualityRules = isQualityMode
  ? {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'sonarjs/cognitive-complexity': ['warn', 15],
      // unicorn rules with existing violations — fix incrementally then promote
      'unicorn/no-useless-undefined': 'warn',
      'unicorn/no-negated-condition': 'warn',
      'unicorn/prefer-number-properties': 'warn',
      'unicorn/prefer-node-protocol': 'warn',
      'unicorn/no-lonely-if': 'warn',
    }
  : {}

// Strict typescript-eslint rules gated behind ESLINT_QUALITY.
// These add high-value checks from the `strict` preset without blocking CI
// until existing violations are resolved.
// These rules require type information, so we also enable projectService
// in the parser options when quality mode is active (see languageOptions below).
const strictTsRules = isQualityMode
  ? {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-confusing-void-expression': 'warn',
      '@typescript-eslint/no-meaningless-void-operator': 'warn',
      '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
    }
  : {}

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'convex/_generated/**',
      '.modules/**',
      '.dependency-cruiser.cjs',
      'eslint.config.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Convex regenerates these files with eslint-disable; suppress unused-directive warnings
  {
    files: ['convex/_generated/*.js', 'convex/_generated/*.d.ts'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    plugins: {
      ...react.configs.flat.recommended.plugins,
      ...react.configs.flat['jsx-runtime'].plugins,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      sonarjs: sonarjs,
      unicorn: unicorn,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // v7 new rules — disabled for now; adopt incrementally via dedicated PRs
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      complexity: ['warn', 10],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Enforce explicit `: unknown` annotation on catch variables to prevent regression.
      // TypeScript's useUnknownInCatchVariables (via strict) makes them implicitly unknown,
      // but this rule ensures the annotation is always present in source.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CatchClause[param][param.typeAnnotation=undefined]',
          message: 'Catch variable must have an explicit `: unknown` type annotation.',
        },
        {
          selector: 'CatchClause[param.typeAnnotation.typeAnnotation.type!="TSUnknownKeyword"]',
          message:
            'Catch variable type must be `: unknown`. Other types (e.g., Error) are not allowed.',
        },
        {
          selector: 'CatchClause:not([param])',
          message:
            'Parameterless catch is not allowed. Use `catch (_: unknown)` to make the type explicit.',
        },
      ],
      ...qualityRules,
      // unicorn: zero-violation rules enforced always; others gated in qualityRules
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/filename-case': 'off',
    },
  },
  // Type-aware strict rules: scoped to production files covered by tsconfig
  // projects so projectService can resolve type information. Only active in
  // quality mode. Test and bench files are excluded — they may fall outside
  // tsconfig project boundaries and the rules add most value on production code.
  ...(isQualityMode
    ? [
        {
          files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
          ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.bench.ts'],
          languageOptions: {
            parserOptions: { projectService: true },
          },
          rules: strictTsRules,
        },
      ]
    : [])
)
