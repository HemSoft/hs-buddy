import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = readFileSync('.github/dependabot.yml', 'utf8').replaceAll('\r\n', '\n')
const npmConfig = config.split('- package-ecosystem: github-actions')[0]
const groupsConfig = npmConfig.match(/ {2}groups:\n(?<body>[\s\S]*?) {2}open-pull-requests-limit:/)
  ?.groups?.body
const groups = [
  ...(groupsConfig?.matchAll(/^ {4}(?<name>[\w-]+):\n(?<body>(?: {6,}.*\n)*)/gm) ?? []),
].map(match => ({ name: match.groups?.name, body: match.groups?.body ?? '' }))
const coupledDependencies = [
  'vitest',
  '@vitest/*',
  '@amiceli/vitest-cucumber',
  '@stryker-mutator/core',
  '@stryker-mutator/vitest-runner',
]

describe('Dependabot groups', () => {
  it('updates the coupled Vitest and Stryker toolchain together', () => {
    const testToolchain = groups.find(group => group.name === 'test-toolchain')
    expect(testToolchain).toBeDefined()

    for (const dependency of coupledDependencies) {
      const pattern = `- "${dependency}"`
      expect(testToolchain?.body).toContain(pattern)
      for (const group of groups.filter(candidate => candidate !== testToolchain)) {
        expect(group.body).not.toContain(pattern)
      }
    }
  })
})
