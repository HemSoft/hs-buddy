import { describe, expect, it } from 'vitest'

import { validateReadmeMetadata } from './check-readme-metadata'

const ciBadge =
  '[![CI](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml?query=branch%3Amain)'
const electronBadge =
  '[![Electron](https://img.shields.io/badge/Electron-44-47848F.svg)](https://www.electronjs.org/)'

function packageJson(electron = '^44.0.0'): string {
  return JSON.stringify({ devDependencies: { electron } })
}

function readme(electronMajor = '44'): string {
  return `${ciBadge}\n${electronBadge}\n\n- **Electron ${electronMajor}** — Desktop framework\n`
}

describe('validateReadmeMetadata', () => {
  it('accepts the workflow badge and synchronized Electron badge and major', () => {
    expect(validateReadmeMetadata(readme(), packageJson())).toEqual([])
  })

  it('reports a missing CI workflow badge', () => {
    expect(validateReadmeMetadata(readme().replace(`${ciBadge}\n`, ''), packageJson())).toContain(
      'README.md must include the main-branch status badge for .github/workflows/ci.yml.'
    )
  })

  it('reports an Electron badge with a stale major', () => {
    const staleBadge =
      '[![Electron](https://img.shields.io/badge/Electron-43-47848F.svg)](https://www.electronjs.org/)'
    expect(
      validateReadmeMetadata(readme().replace(electronBadge, staleBadge), packageJson())
    ).toContain('README.md Electron badge must declare Electron 44.')
  })

  it('reports drift between package.json and the Tech Stack', () => {
    expect(validateReadmeMetadata(readme('43'), packageJson())).toContain(
      'README.md Tech Stack must declare Electron 44; found 43.'
    )
  })

  it('reports an invalid Electron dependency declaration', () => {
    expect(validateReadmeMetadata(readme(), packageJson('workspace:*'))).toContain(
      'package.json must declare a versioned Electron devDependency.'
    )
  })
})
