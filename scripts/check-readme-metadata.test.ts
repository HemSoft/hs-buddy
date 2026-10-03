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
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)]
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue.svg)]
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)]
**Electron 44** **React 19** **TypeScript 6** **Vite 8** 2 schema tables
**Node.js 22+**
Project tree: 2 schema tables`,
    contributing: '[Node.js](https://nodejs.org/) 22+',
    vision: `| Desktop    | Electron 44 |
Electron 44 + React 19 + Vite 8
2 schema tables · scheduled jobs
React 19, TypeScript 6, Vite 8
Convex 1.45.0
\`@github/copilot-sdk\` 1.0.13
Data Model (2 Convex Schema Tables + System Storage)
**BDD**: 6 tracked Gherkin feature specs`,
    schema:
      'export default defineSchema({\n  first: defineTable({}),\n  second: defineTable({}),\n  /* retired: defineTable({}) */\n})',
    featureCount: 6,
  }
}

describe('validateDocumentationMetadata', () => {
  it('accepts synchronized manifest, schema, and feature claims', () => {
    expect(validateDocumentationMetadata(sources(), packageJson)).toEqual([])
  })

  it.each(['22.12.0', '22.12.1'])('retains nonzero minor and patch Node floors for %s', floor => {
    const metadata = JSON.parse(packageJson)
    metadata.engines.node = `>=${floor}`
    const requirement = floor === '22.12.0' ? '22.12' : floor
    const manifest = JSON.stringify(metadata)
    const original = sources()
    expect(validateDocumentationMetadata(original, manifest)).toEqual(
      expect.arrayContaining([
        `CONTRIBUTING.md prerequisites must require Node.js ${requirement}+.`,
        `README.md prerequisites must require Node.js ${requirement}+.`,
      ])
    )
    original.readme = original.readme.replace('Node.js 22+', `Node.js ${requirement}+`)
    original.contributing = original.contributing.replace('22+', `${requirement}+`)
    expect(validateDocumentationMetadata(original, manifest)).toEqual([])
  })

  it.each([undefined, {}, { node: 'unsupported' }])(
    'reports missing Node metadata for %j',
    engines => {
      const metadata = JSON.parse(packageJson)
      metadata.engines = engines
      delete metadata.dependencies.react
      expect(validateDocumentationMetadata(sources(), JSON.stringify(metadata))).toEqual([
        'package.json must declare a versioned react requirement.',
        'package.json must declare a versioned node requirement.',
      ])
    }
  )

  it('reports stale manifest-derived framework documentation', () => {
    const stale = sources()
    stale.vision = stale.vision.replace('Electron 44 +', 'Electron 43 +')
    stale.readme = stale.readme.replace('badge/React-19-', 'badge/React-18-')
    expect(validateDocumentationMetadata(stale, packageJson)).toEqual(
      expect.arrayContaining([
        'docs/VISION.md architecture versions must match package.json.',
        'README.md React badge must declare React 19.',
      ])
    )
  })

  it('reports stale schema and feature totals', () => {
    const stale = sources()
    stale.readme = stale.readme.replace('2 schema tables', '1 schema tables')
    stale.vision = stale.vision
      .replace('6 tracked Gherkin', '3 tracked Gherkin')
      .replace('2 schema tables ·', '1 schema tables ·')
    expect(validateDocumentationMetadata(stale, packageJson)).toEqual(
      expect.arrayContaining([
        'README.md must declare 2 schema tables in both maintained claims.',
        'docs/VISION.md must declare 6 tracked Gherkin feature specs.',
        'docs/VISION.md architecture must declare 2 schema tables.',
      ])
    )
  })

  it('reports stale README prerequisites, a missing CI badge, and invalid package metadata', () => {
    const missingBadge = sources()
    missingBadge.readme = missingBadge.readme.replace(ciBadge, '')
    missingBadge.readme = missingBadge.readme.replace('**Node.js 22+**', '**Node.js 20+**')
    expect(validateDocumentationMetadata(missingBadge, packageJson)).toEqual(
      expect.arrayContaining([
        'README.md must include the main-branch status badge for .github/workflows/ci.yml.',
        'README.md prerequisites must require Node.js 22+.',
      ])
    )
    expect(validateDocumentationMetadata(sources(), '{')).toContain(
      'package.json must contain valid JSON.'
    )
  })
})
