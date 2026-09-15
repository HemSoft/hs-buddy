import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8')
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n')
const launcher = readFileSync('scripts/run-electron-e2e.ts', 'utf8')
const environment = readFileSync('e2e/electron-environment.ts', 'utf8')
const fixtures = readFileSync('e2e/electron-fixtures.ts', 'utf8')
const spec = readFileSync('e2e/electron.spec.ts', 'utf8')

function jobBlock(name: string): string {
  const block = workflow.split(`  ${name}:`)[1]?.split(/\n {2}[\w-]+:/, 1)[0]
  if (!block) throw new Error(`Missing workflow job ${name}`)
  return block
}

describe('real Electron E2E contract', () => {
  it('keeps the package command and Playwright project self-contained', () => {
    expect(packageJson.scripts['test:e2e:electron']).toBe('bun scripts/run-electron-e2e.ts')
    expect(launcher).toContain("'vite', 'build', '--mode', 'electron-e2e'")
    expect(launcher).toContain("'playwright', 'test', '--project=electron-e2e'")
    expect(playwrightConfig).toContain("name: 'electron-e2e'")
    expect(playwrightConfig).toContain('testMatch: /electron\\.spec\\.ts/')
    expect(playwrightConfig).toMatch(/webServer: isElectronE2E\s*\? undefined/)
  })

  it('launches isolated offline Electron and always removes its state', () => {
    expect(fixtures).toContain('electron.launch({')
    expect(fixtures).toContain('`--user-data-dir=${userDataDir}`')
    expect(fixtures).toContain('offline: true')
    expect(fixtures).toContain('electronE2EEnvironment(')
    expect(environment).toContain('PASSTHROUGH_ENVIRONMENT')
    expect(environment).not.toContain('GITHUB_TOKEN')
    expect(environment).not.toContain('SLACK_TOKEN')
    expect(fixtures).toContain('await closeApplication(app)')
    expect(fixtures).toContain('await rm(testRoot, { recursive: true, force: true })')
    expect(fixtures).toContain("'electron-process.log'")
  })

  it('requires all four renderer-to-main behaviors without passing no-op guards', () => {
    for (const behavior of [
      "'config:set-theme'",
      'window.filesystem.readDir',
      'window.filesystem.readFile',
      'window.terminal.spawn',
      'window.terminal.write',
      'window.terminal.resize',
      'window.terminal.kill',
    ]) {
      expect(spec).toContain(behavior)
    }
    expect(spec).not.toContain('.skip(')
    expect(spec).not.toContain('.count()')
  })

  it('makes the Ubuntu Electron job part of final qualification with failure artifacts', () => {
    const electronJob = jobBlock('test-electron-e2e')
    expect(electronJob).toContain('runs-on: ubuntu-latest')
    expect(electronJob).toContain('xvfb-run --auto-servernum bun run test:e2e:electron')
    expect(electronJob).toContain('if: always()')
    expect(electronJob).toContain('electron-e2e-results.xml')
    expect(electronJob).toContain('test-results/')
    expect(electronJob).toContain('playwright-electron-report/')

    expect(jobBlock('ci-feedback')).toContain('test-electron-e2e')
    expect(jobBlock('ci-complete')).toContain('ci-feedback')
  })
})
