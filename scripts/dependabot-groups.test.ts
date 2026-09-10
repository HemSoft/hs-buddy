import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = readFileSync('.github/dependabot.yml', 'utf8').replaceAll('\r\n', '\n')
const npmConfig = config.split('- package-ecosystem: github-actions')[0]
const testToolchain = npmConfig.match(/ {4}test-toolchain:\n(?<body>(?: {6,}.*\n)+)/)?.groups?.body

describe('Dependabot groups', () => {
  it('updates the coupled Vitest and Stryker toolchain together', () => {
    expect(testToolchain).toBeDefined()
    for (const dependency of [
      'vitest',
      '@vitest/*',
      '@amiceli/vitest-cucumber',
      '@stryker-mutator/core',
      '@stryker-mutator/vitest-runner',
    ]) {
      expect(testToolchain).toContain(`- "${dependency}"`)
    }
    expect(npmConfig).not.toMatch(/^ {4}(?:stryker|vitest):$/m)
  })
})
