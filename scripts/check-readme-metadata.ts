import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CI_BADGE =
  '[![CI](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HemSoft/hs-buddy/actions/workflows/ci.yml?query=branch%3Amain)'

type PackageMetadata = {
  devDependencies?: Record<string, string>
}

type ElectronMajorResult = { major: string; error?: never } | { major?: never; error: string }

export function validateReadmeMetadata(readme: string, packageJson: string): string[] {
  const errors: string[] = []

  if (!readme.includes(CI_BADGE)) {
    errors.push('README.md must include the main-branch status badge for .github/workflows/ci.yml.')
  }

  const electron = readElectronMajor(packageJson)
  if (electron.error !== undefined) {
    return [...errors, electron.error]
  }

  const electronBadge = `[![Electron](https://img.shields.io/badge/Electron-${electron.major}-47848F.svg)](https://www.electronjs.org/)`
  if (!readme.includes(electronBadge)) {
    errors.push(`README.md Electron badge must declare Electron ${electron.major}.`)
  }

  const documentedMajor = readme.match(/^- \*\*Electron (\d+)\*\*/m)?.[1]
  if (documentedMajor !== electron.major) {
    errors.push(
      `README.md Tech Stack must declare Electron ${electron.major}; found ${documentedMajor ?? 'no Electron major'}.`
    )
  }

  return errors
}

function readElectronMajor(packageJson: string): ElectronMajorResult {
  let metadata: PackageMetadata
  try {
    metadata = JSON.parse(packageJson) as PackageMetadata
  } catch (_: unknown) {
    return { error: 'package.json must contain valid JSON.' }
  }

  const electronRange = metadata.devDependencies?.electron
  const electronMajor = electronRange?.match(/\d+/)?.[0]
  if (electronMajor === undefined) {
    return { error: 'package.json must declare a versioned Electron devDependency.' }
  }

  return { major: electronMajor }
}

export function runReadmeMetadataCheck(root = process.cwd()): void {
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
  const packageJson = readFileSync(resolve(root, 'package.json'), 'utf8')
  const errors = validateReadmeMetadata(readme, packageJson)

  if (errors.length > 0) {
    console.error('README metadata check failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log('README metadata check passed.')
}

if (import.meta.main) {
  runReadmeMetadataCheck()
}
