import { describe, expect, it } from 'vitest'

import { validateDocumentationMetadata } from './check-readme-metadata'

const ciBadge =
  '[![CI](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml?query=branch%3Amain)'

const packageJson = JSON.stringify({
  engines: { node: '>=22.0.0' },
  dependencies: {
    react: '^19.2.7',
    convex: '1.45.0',
    '@github/copilot-sdk': '1.0.13',
  },
  devDependencies: {
    electron: '^44.0.0',
    typescript: '~6.0.3',
    vite: '8.2.2',
  },
})

function sources() {
  return {
    readme: `${ciBadge}
[![Electron](https://img.shields.io/badge/Electron-44-47848F.svg)]
**Electron 44** **React 19** **TypeScript 6** **Vite 8** 2 schema tables
Project tree: 2 schema tables`,
    contributing: '[Node.js](https://nodejs.org/) 22+',
    vision: `Electron 44 + React 19 + Vite 8
React 19, TypeScript 6, Vite 8
Convex 1.45.0
\`@github/copilot-sdk\` 1.0.13
Data Model (2 Convex Tables)
**BDD**: 6 tracked Gherkin feature specs`,
    schema: '  first: defineTable({})\n  second: defineTable({})\n  // old: defineTable({})',
    featureCount: 6,
  }
}

describe('validateDocumentationMetadata', () => {
  it('accepts synchronized manifest, schema, and feature claims', () => {
    expect(validateDocumentationMetadata(sources(), packageJson)).toEqual([])
  })

  it('reports stale manifest-derived framework documentation', () => {
    const stale = sources()
    stale.vision = stale.vision.replace('Electron 44 +', 'Electron 43 +')
    expect(validateDocumentationMetadata(stale, packageJson)).toContain(
      'docs/VISION.md architecture versions must match package.json.'
    )
  })

  it('reports stale schema and feature totals', () => {
    const stale = sources()
    stale.readme = stale.readme.replace('2 schema tables', '1 schema tables')
    stale.vision = stale.vision.replace('6 tracked Gherkin', '3 tracked Gherkin')
    expect(validateDocumentationMetadata(stale, packageJson)).toEqual(
      expect.arrayContaining([
        'README.md must declare 2 schema tables in both maintained claims.',
        'docs/VISION.md must declare 6 tracked Gherkin feature specs.',
      ])
    )
  })

  it('reports a missing CI badge and invalid package metadata', () => {
    const missingBadge = sources()
    missingBadge.readme = missingBadge.readme.replace(ciBadge, '')
    expect(validateDocumentationMetadata(missingBadge, packageJson)).toContain(
      'README.md must include the main-branch status badge for .github/workflows/ci.yml.'
    )
    expect(validateDocumentationMetadata(sources(), '{')).toContain(
      'package.json must contain valid JSON.'
    )
  })
})
