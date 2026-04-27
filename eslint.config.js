import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import sonarjs from 'eslint-plugin-sonarjs'
import globals from 'globals'

// Quality gate rules activate via: ESLINT_QUALITY=1 eslint .
// They produce warnings that would break --max-warnings 0, so they only
// run in the lint:quality script. Graduate to always-on once violations hit 0.
const qualityRules = process.env.ESLINT_QUALITY === '1'
  ? {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'sonarjs/cognitive-complexity': ['warn', 15],
    }
  : {}

export default tseslint.config(
  { ignores: ['dist/**', 'dist-electron/**', 'convex/_generated/**', '.modules/**', '.dependency-cruiser.cjs', 'eslint.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
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
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
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
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      ...qualityRules,
    },
  }
)
