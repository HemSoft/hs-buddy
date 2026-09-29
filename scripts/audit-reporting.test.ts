import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const runner = resolve('scripts/whats-next.ps1')
const modulePath = resolve('scripts/audit-reporting.psm1')
const powershell =
  process.env.PWSH_EXECUTABLE ?? (process.platform === 'win32' ? 'pwsh.exe' : 'pwsh')
const nativeCommandTimeout = 20_000
// Two bounded native invocations must fit inside one contract, including cold startup.
const nativeOptions = { timeout: nativeCommandTimeout * 2 + 5_000 }
const probe = spawnSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], {
  encoding: 'utf8',
  timeout: nativeCommandTimeout,
})
const available = !probe.error && probe.status === 0
let root: string

function run(...args: string[]) {
  return spawnSync(powershell, ['-NoProfile', ...args], {
    encoding: 'utf8',
    timeout: nativeCommandTimeout,
    env: {
      ...process.env,
      AUDIT_TEST_ROOT: root,
      AUDIT_TEST_MODULE: modulePath,
      AUDIT_TEST_SHELL: powershell,
    },
  })
}

function report(...args: string[]) {
  const result = run('-File', runner, '-Repository', root, '-SkipScorecard', '-Json', ...args)
  expect(result.error).toBeUndefined()
  return { code: result.status, data: JSON.parse(result.stdout) }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'buddy-audit-contract-'))
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  copyFileSync('.github/workflows/ci.yml', join(root, '.github/workflows/ci.yml'))
  copyFileSync('package.json', join(root, 'package.json'))
  for (const config of [
    'vitest.config.ts',
    'vitest.electron.config.ts',
    'vitest.convex.config.ts',
  ]) {
    copyFileSync(config, join(root, config))
  }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe.skipIf(!available)('local audit policy, requires PowerShell 7', nativeOptions, () => {
  it('reads current enforced targets and separates the renderer reporting goal', () => {
    const config = join(root, 'vitest.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace('statements: 99,', 'statements: 98.5,')
    )
    const { code, data } = report('-PlanOnly')
    expect(code).toBe(0)
    expect(data.CoveragePolicy.Renderer.Enforced).toEqual({
      statements: 98.5,
      branches: 99,
      functions: 100,
      lines: 100,
    })
    expect(data.CoveragePolicy.Renderer.AspirationalTarget).toContain('reports only')
    expect(
      data.Gates.find((gate: { Gate: string }) => gate.Gate === 'Test Coverage').Target
    ).toContain('98.5% statements')
    expect(data).not.toHaveProperty('PerfectionScore')
    expect(data.FullQualification).toBe(false)
  })

  it('accounts for every current CI job and blocks newly discovered unmapped jobs', () => {
    const { data } = report('-PlanOnly')
    const jobs = readFileSync('.github/workflows/ci.yml', 'utf8').split(/^jobs:\s*$/m)[1]
    const names = [...jobs.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*$/gm)].map(match => match[1])
    expect(data.CIGates.map((gate: { Gate: string }) => gate.Gate)).toEqual([
      ...names,
      'npm audit',
      'CodeQL',
    ])
    expect(data.CIGates.every((gate: { Detail: string }) => gate.Detail.length > 0)).toBe(true)
    writeFileSync(
      join(root, '.github/workflows/ci.yml'),
      `${readFileSync('.github/workflows/ci.yml', 'utf8')}\n  _future_gate:\n    runs-on: ubuntu-latest\n`
    )
    const changed = report('-PlanOnly')
    expect(changed.code).toBe(2)
    expect(changed.data.CIGates.at(-3)).toMatchObject({ Gate: '_future_gate', Status: 'BLOCKED' })
  })
})

describe.skipIf(!available)('CI YAML discovery, requires PowerShell 7', nativeOptions, () => {
  it('accounts for quoted inline job mappings instead of skipping valid YAML forms', () => {
    const workflow = join(root, '.github/workflows/ci.yml')
    writeFileSync(
      workflow,
      `${readFileSync(workflow, 'utf8')}\n  "_quoted_job": { runs-on: ubuntu-latest, steps: [{ run: 'echo metadata' }] }\n`
    )
    const { code, data } = report('-PlanOnly')
    expect(code).toBe(2)
    expect(
      data.CIGates.find((gate: { Gate: string }) => gate.Gate === '_quoted_job')
    ).toMatchObject({ Status: 'BLOCKED' })
  })
})

describe.skipIf(!available)('local audit blockers, requires PowerShell 7', nativeOptions, () => {
  it('rejects stale artifacts and missing dependencies before invoking bundle qualification', () => {
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeFileSync(join(root, 'dist/index.html'), 'stale artifact')
    const { code, data } = report('-Gates', 'Bundle Size')
    expect(code).toBe(2)
    expect(data.Gates.find((gate: { Gate: string }) => gate.Gate === 'Build')).toMatchObject({
      Status: 'BLOCKED',
    })
    expect(data.Gates.find((gate: { Gate: string }) => gate.Gate === 'Bundle Size')).toMatchObject({
      Status: 'BLOCKED',
    })
    expect(readFileSync(join(root, 'dist/index.html'), 'utf8')).toBe('stale artifact')
  })

  it('distinguishes code errors, warning-only results and unavailable measurements', () => {
    const result = run(
      '-Command',
      `
      Import-Module $env:AUDIT_TEST_MODULE -Force -DisableNameChecking
      $spec = [pscustomobject]@{ Gate='Dep Cruiser'; External=$false }
      $external = [pscustomobject]@{ Gate='Scorecard'; External=$true }
      [pscustomobject]@{
        Missing = Get-AuditCommandStatus $spec 127 'command not found'
        CodeError = Get-AuditCommandStatus $spec 1 "error TS2307: Cannot find module './missing-source'"
        Warning = Get-AuditCommandStatus $spec 0 '0 errors, 1 warnings'
        Detail = Get-AuditDetail $spec @('1 dependency violations (0 errors, 1 warnings)')
        Service = Get-AuditCommandStatus $external 1 'HTTP 404'
        Aspire = Get-AuditCommandStatus ([pscustomobject]@{Gate='TypeScript'; External=$false}) 1 'ERROR: Aspire AppHost is not bootstrapped.'
        MissingBuild = Test-FreshAuditBuild $env:AUDIT_TEST_ROOT ([datetime]::UtcNow)
        Tool = Get-AuditPrerequisite ([pscustomobject]@{FilePath='buddy-tool-that-does-not-exist'}) $env:AUDIT_TEST_ROOT @{}
      } | ConvertTo-Json
    `
    )
    expect(result.status).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data).toMatchObject({
      Missing: 'BLOCKED',
      CodeError: 'FAIL',
      Warning: 'PASS',
      Service: 'BLOCKED',
      Aspire: 'BLOCKED',
    })
    expect(data.Detail).toBe('0 errors, 1 warnings; warnings are nonblocking')
    expect(data.MissingBuild).toContain('Missing fresh build output')
    expect(data.Tool).toContain('Missing executable')
  })
})

describe.skipIf(!available)(
  'local audit discovery failures, requires PowerShell 7',
  nativeOptions,
  () => {
    it('preserves the complete version 2 envelope when configs cannot be read', () => {
      rmSync(join(root, 'vitest.config.ts'))
      const { code, data } = report('-PlanOnly')
      expect(code).toBe(2)
      expect(Object.keys(data).sort()).toEqual([
        'BaselineScore',
        'CIGates',
        'CoveragePolicy',
        'FullQualification',
        'Gates',
        'GeneratedAt',
        'NextActions',
        'ReportVersion',
        'Repository',
        'Scope',
      ])
      expect(data.ReportVersion).toBe(2)
      expect(data.CoveragePolicy).toBeNull()
      expect(data.Gates[0]).toMatchObject({ Gate: 'Policy discovery', Status: 'BLOCKED' })
      expect(data.NextActions).toHaveLength(2)
      copyFileSync('vitest.config.ts', join(root, 'vitest.config.ts'))
      rmSync(join(root, '.github/workflows/ci.yml'))
      const missingWorkflow = report('-PlanOnly')
      expect(missingWorkflow.code).toBe(2)
      expect(missingWorkflow.data.ReportVersion).toBe(2)
      expect(missingWorkflow.data.CIGates[0]).toMatchObject({
        Gate: 'CI scope discovery',
        Status: 'BLOCKED',
      })
    })

    it('blocks partial installs without allowing bunx to fetch Vite', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devDependencies: { vite: '1.0.0' } })
      )
      mkdirSync(join(root, 'node_modules/vite'), { recursive: true })
      writeFileSync(join(root, 'node_modules/vite/package.json'), '{}')
      const { code, data } = report('-Gates', 'Bundle Size')
      expect(code).toBe(2)
      expect(data.Gates.find((gate: { Gate: string }) => gate.Gate === 'Build')).toMatchObject({
        Status: 'BLOCKED',
        Command: 'node node_modules/vite/bin/vite.js build',
        Detail: 'Missing checkout-local Vite CLI; no package will be installed during audit',
      })
      expect(readFileSync('scripts/crap-coverage.ts', 'utf8')).toMatch(
        /\[\s*'--no-install',\s*'vitest'/
      )
    })
  }
)

describe.skipIf(!available)(
  'local audit module prerequisites, requires PowerShell 7',
  nativeOptions,
  () => {
    it('blocks module-backed gates when an incomplete node_modules directory exists', () => {
      mkdirSync(join(root, 'node_modules'))
      for (const name of ['React Doctor', 'e18e']) {
        const { code, data } = report('-Gates', name)
        expect(code).toBe(2)
        const gate = data.Gates.find((item: { Gate: string }) => item.Gate === name)
        expect(gate.Status).toBe('BLOCKED')
        expect(gate.Detail).toContain('Missing checkout-local module')
      }
    })
  }
)

describe.skipIf(!available)(
  'composite gate prerequisites, requires PowerShell 7',
  nativeOptions,
  () => {
    it('uses maintained declarations for every composite command dependency', () => {
      const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
      for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
        mkdirSync(join(root, 'node_modules', name), { recursive: true })
        writeFileSync(join(root, 'node_modules', name, 'package.json'), '{}')
      }
      const result = run(
        '-Command',
        `
      Import-Module $env:AUDIT_TEST_MODULE -Force -DisableNameChecking
      $root = $env:AUDIT_TEST_ROOT
      $plan = @(Get-AuditGatePlan (Get-CoveragePolicy $root) $root)
      Remove-Item "$root/node_modules/@vitest/coverage-v8/package.json"
      $crap = Get-AuditPrerequisite ($plan | Where-Object Gate -eq 'CRAP Score') $root @{}
      Set-Content "$root/node_modules/@vitest/coverage-v8/package.json" '{}'
      Remove-Item "$root/node_modules/typescript/package.json"
      $quality = Get-AuditPrerequisite ($plan | Where-Object Gate -eq 'Quality Lint') $root @{}
      [pscustomobject]@{ Crap=$crap; Quality=$quality } | ConvertTo-Json
    `
      )
      expect(result.status).toBe(0)
      const data = JSON.parse(result.stdout)
      expect(data.Crap).toContain('Missing checkout-local module: @vitest/coverage-v8')
      expect(data.Quality).toContain('Missing checkout-local module: typescript')
    })
  }
)

describe.skipIf(!available)(
  'scorecard failure evidence, requires PowerShell 7',
  nativeOptions,
  () => {
    it('retains successful-command JSON and failing rules in gates and next actions', () => {
      const payload = {
        classification: { numericScore: 95, maxPoints: 100, level: 'Silver' },
        rules: [{ id: 'fixture-rule', passed: false, reason: 'Fixture finding' }],
      }
      mkdirSync(join(root, 'scripts'))
      writeFileSync(
        join(root, 'scripts/get-scorecard-report.ps1'),
        `Write-Output '${JSON.stringify(payload)}'`
      )
      const result = run('-File', runner, '-Repository', root, '-Json', '-Gates', 'Scorecard')
      expect(result.status).toBe(1)
      const data = JSON.parse(result.stdout)
      const gate = data.Gates.find((item: { Gate: string }) => item.Gate === 'Scorecard')
      expect(gate.Status).toBe('FAIL')
      expect(gate.ExitCode).toBe(0)
      expect(JSON.parse(gate.Output.join('\n'))).toEqual(payload)
      expect(
        data.NextActions.find((item: { Gate: string }) => item.Gate === 'Scorecard').Output
      ).toEqual(gate.Output)
    })
  }
)

describe.skipIf(!available)(
  'local audit build receipts, requires PowerShell 7',
  nativeOptions,
  () => {
    it("requires fresh outputs and this invocation's successful build receipt", () => {
      const result = run(
        '-Command',
        `
      Import-Module $env:AUDIT_TEST_MODULE -Force -DisableNameChecking
      $root = $env:AUDIT_TEST_ROOT
      New-Item -ItemType Directory "$root/dist", "$root/dist-electron", "$root/node_modules" | Out-Null
      New-Item -ItemType Directory "$root/node_modules/es-module-lexer" | Out-Null
      Set-Content "$root/node_modules/es-module-lexer/package.json" '{}'
      Set-Content "$root/package.json" '{"dependencies":{"es-module-lexer":"2.0.0"}}'
      Set-Content "$root/dist/index.html" 'fixture'
      Set-Content "$root/dist-electron/main.js" 'fixture'
      (Get-Item "$root/dist/index.html").LastWriteTimeUtc = [datetime]::UtcNow.AddDays(-1)
      $stale = Test-FreshAuditBuild $root ([datetime]::UtcNow.AddMinutes(-1))
      (Get-Item "$root/dist/index.html").LastWriteTimeUtc = [datetime]::UtcNow
      $spec = [pscustomobject]@{Gate='Bundle Size'; FilePath=$env:AUDIT_TEST_SHELL; External=$false; Requires=@('Build')}
      [pscustomobject]@{
        Stale = $stale
        Fresh = Test-FreshAuditBuild $root ([datetime]::UtcNow.AddMinutes(-1))
        NoReceipt = Get-AuditPrerequisite $spec $root @{}
        FailedReceipt = Get-AuditPrerequisite $spec $root @{Build=[pscustomobject]@{Status='FAIL'}}
        ValidReceipt = Get-AuditPrerequisite $spec $root @{Build=[pscustomobject]@{Status='PASS'}}
      } | ConvertTo-Json
    `
      )
      expect(result.status).toBe(0)
      const data = JSON.parse(result.stdout)
      expect(data.Stale).toContain('Stale build output')
      expect(data.Fresh).toBeNull()
      expect(data.NoReceipt).toContain('this invocation')
      expect(data.FailedReceipt).toContain('this invocation')
      expect(data.ValidReceipt).toBeNull()
    })
  }
)
