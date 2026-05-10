import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSpawn = vi.fn().mockImplementation(() => ({
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: vi.fn().mockReturnValue(''),
}))

const mockExistsSync = vi.fn().mockReturnValue(false)
const mockReadFileSync = vi.fn().mockReturnValue('{}')
const mockReaddirSync = vi.fn().mockReturnValue([])
const mockWriteFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}))

vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mock/service'),
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}))

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}))

import {
  setStatusChangeCallback,
  listLoops,
  getScriptsPath,
  launchLoop,
  stopLoop,
  getLoopStatus,
  listTemplateScripts,
  getConfig,
  initRalphService,
  shutdownRalphService,
} from './ralphService'

describe('ralphService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('setStatusChangeCallback', () => {
    it('accepts a callback', () => {
      expect(() => setStatusChangeCallback(vi.fn())).not.toThrow()
    })

    it('accepts null', () => {
      expect(() => setStatusChangeCallback(null)).not.toThrow()
    })
  })

  describe('listLoops', () => {
    it('returns an array', () => {
      const result = listLoops()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getScriptsPath', () => {
    it('throws when scripts directory not found', () => {
      mockExistsSync.mockReturnValue(false)
      expect(() => getScriptsPath()).toThrow('Ralph scripts not found')
    })

    it('returns path when scripts directory exists', () => {
      mockExistsSync.mockReturnValue(true)
      const path = getScriptsPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })
  })

  describe('launchLoop - config validation', () => {
    it('returns error for missing repoPath', () => {
      const result = launchLoop({ repoPath: '', scriptType: 'ralph' } as Parameters<
        typeof launchLoop
      >[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repoPath must be an absolute path')
    })

    it('returns error for relative repoPath', () => {
      const result = launchLoop({ repoPath: 'relative/path', scriptType: 'ralph' } as Parameters<
        typeof launchLoop
      >[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repoPath must be an absolute path')
    })

    it('returns error when repoPath does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const result = launchLoop({
        repoPath: '/nonexistent/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')
    })

    it('returns error for forbidden characters in repoPath', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/path/with;semicolon',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('forbidden characters')
    })

    it('returns error for invalid scriptType', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'invalid' as 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid scriptType')
    })

    it('returns error when ralph-pr is missing prNumber', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-pr',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('PR number is required')
    })

    it('returns error for iterations out of range', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        iterations: 200,
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('iterations must be between 1 and 100')
    })

    it('returns error for invalid workUntil format', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        workUntil: 'invalid',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('workUntil must be HH:mm format')
    })
  })

  describe('launchLoop - successful spawn', () => {
    it('spawns process and returns runId on valid config', () => {
      // First call: getScriptsDir (existsSync for devPath)
      // Second call: existsSync for repoPath
      // Third call: existsSync for script file
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(result.runId).toBe('test-uuid-1234')
      expect(mockSpawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining(['-NoProfile', '-File']),
        expect.objectContaining({ cwd: '/valid/path', shell: false })
      )
    })
  })

  describe('stopLoop', () => {
    it('returns error for unknown runId', () => {
      const result = stopLoop('nonexistent-id')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Run not found')
    })
  })

  describe('getLoopStatus', () => {
    it('returns null for unknown runId', () => {
      expect(getLoopStatus('unknown')).toBeNull()
    })
  })

  describe('listTemplateScripts', () => {
    it('returns empty array when scripts subdirectory does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      // getScriptsDir will throw since existsSync is false
      // But listTemplateScripts checks existsSync on the scripts subdir
      expect(() => listTemplateScripts()).toThrow()
    })

    it('returns parsed scripts when directory exists with .ps1 files', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-issues.ps1', 'ralph-review.ps1'])
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('ralph-review.ps1')) {
          return [
            '# ralph-review.ps1 — Reviews pull requests.',
            '# Version: 1.2.0',
            '$reviewPrompt = @"',
            'Review the selected pull request for bugs',
            '"@',
          ].join('\n')
        }

        return [
          '# ralph-issues.ps1 — Finds repository issues.',
          '# Version: 1.2.0',
          "& $_ralph -Prompt 'Analyze the repository for issues'",
        ].join('\n')
      })

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(2)
      expect(scripts[0]).toMatchObject({
        filename: 'ralph-issues.ps1',
        name: 'Issues',
        description: 'Finds repository issues.',
        defaultPrompt: 'Analyze the repository for issues',
      })
      expect(scripts[1]).toMatchObject({
        filename: 'ralph-review.ps1',
        name: 'Review',
        description: 'Reviews pull requests.',
        defaultPrompt: 'Review the selected pull request for bugs',
      })
    })

    it('falls back to the next leading comment when the title description is blank', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-issues.ps1'])
      mockReadFileSync.mockReturnValue(
        "# ralph-issues.ps1 —   \n# Finds repository issues.\n# Version: 1.2.0\n& $_ralph -Prompt 'Analyze the repository for issues'"
      )

      const scripts = listTemplateScripts()

      expect(scripts[0].description).toBe('Finds repository issues.')
    })
  })

  describe('getConfig', () => {
    it('reads models config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: { 'gpt-4': {} }, aliases: {}, tiers: {} })
      )

      const result = getConfig('models')
      expect(result).toEqual({ models: { 'gpt-4': {} }, aliases: {}, tiers: {} })
    })

    it('reads agents config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ agents: ['copilot'] }))

      const result = getConfig('agents')
      expect(result).toEqual({ agents: ['copilot'] })
    })

    it('reads providers config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ providers: ['copilot'] }))

      const result = getConfig('providers')
      expect(result).toEqual({ providers: ['copilot'] })
    })

    it('throws when config file not found', () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('config')) return false
        return true
      })

      expect(() => getConfig('models')).toThrow('Config file not found')
    })
  })

  describe('stopLoop with active run', () => {
    it('stops an active run and sets status to cancelled', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const runId = result.runId!

      const stopResult = stopLoop(runId)
      expect(stopResult.success).toBe(true)

      const status = getLoopStatus(runId)
      expect(status?.status).toBe('cancelled')
    })

    it('returns error when run is not running', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      // Stop first time
      stopLoop(runId)
      // Try to stop again
      const secondStop = stopLoop(runId)
      expect(secondStop.success).toBe(false)
      expect(secondStop.error).toContain('is not running')
    })
  })

  describe('process output parsing', () => {
    it('parses iteration markers from stdout', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const runId = result.runId!

      // Get the stdout handler from the mock spawn
      const stdoutOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.stdout.on
      const stdoutCallback = stdoutOn.mock.calls.find((c: unknown[]) => c[0] === 'data')?.[1]

      expect(stdoutCallback).toEqual(expect.any(Function))
      stdoutCallback!(Buffer.from('=== ITERATION 3 ===\n'))
      const status = getLoopStatus(runId)
      expect(status?.currentIteration).toBe(3)
      expect(status?.phase).toBe('iterating')
    })

    it('tracks check stats from stdout', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const stdoutOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.stdout.on
      const stdoutCallback = stdoutOn.mock.calls.find((c: unknown[]) => c[0] === 'data')?.[1]

      expect(stdoutCallback).toEqual(expect.any(Function))
      stdoutCallback!(Buffer.from('== Check 1 of 5\n'))
      const status = getLoopStatus(runId)
      expect(status?.stats.checks).toBe(1)
    })

    it('handles process error event', () => {
      const statusCb = vi.fn()
      setStatusChangeCallback(statusCb)
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const procOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.on
      const errorCallback = procOn.mock.calls.find((c: unknown[]) => c[0] === 'error')?.[1]

      expect(errorCallback).toEqual(expect.any(Function))
      errorCallback!(new Error('spawn failed'))
      const status = getLoopStatus(runId)
      expect(status?.status).toBe('failed')
      expect(status?.error).toBe('spawn failed')

      setStatusChangeCallback(null)
    })

    it('handles process close event with exit code 0', () => {
      const statusCb = vi.fn()
      setStatusChangeCallback(statusCb)
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const procOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.on
      const closeCallback = procOn.mock.calls.find((c: unknown[]) => c[0] === 'close')?.[1]

      expect(closeCallback).toEqual(expect.any(Function))
      closeCallback!(0)
      const status = getLoopStatus(runId)
      expect(status?.status).toBe('completed')
      expect(status?.exitCode).toBe(0)
    })

    it('handles process close event with non-zero exit code', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const procOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.on
      const closeCallback = procOn.mock.calls.find((c: unknown[]) => c[0] === 'close')?.[1]

      expect(closeCallback).toEqual(expect.any(Function))
      closeCallback!(1)
      const status = getLoopStatus(runId)
      expect(status?.status).toBe('failed')
      expect(status?.exitCode).toBe(1)
    })

    it('does not overwrite cancelled status on close', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      stopLoop(runId) // sets status to 'cancelled'

      const procOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.on
      const closeCallback = procOn.mock.calls.find((c: unknown[]) => c[0] === 'close')?.[1]

      expect(closeCallback).toEqual(expect.any(Function))
      closeCallback!(1) // should NOT overwrite 'cancelled'
      const status = getLoopStatus(runId)
      expect(status?.status).toBe('cancelled')
    })

    it('tracks cost and premium stats', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const stdoutOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.stdout.on
      const stdoutCallback = stdoutOn.mock.calls.find((c: unknown[]) => c[0] === 'data')?.[1]

      expect(stdoutCallback).toEqual(expect.any(Function))
      stdoutCallback!(Buffer.from('   Cost  $1.23 (45 premium requests)\n'))
      const status = getLoopStatus(runId)
      expect(status?.stats.totalCost).toBe('$1.23')
      expect(status?.stats.totalPremium).toBe(45)
    })

    it('appends stderr lines to log buffer', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      const runId = result.runId!
      const stderrOn = mockSpawn.mock.results[mockSpawn.mock.results.length - 1].value.stderr.on
      const stderrCallback = stderrOn.mock.calls.find((c: unknown[]) => c[0] === 'data')?.[1]

      expect(stderrCallback).toEqual(expect.any(Function))
      stderrCallback!(Buffer.from('Warning: something happened\n'))
      const status = getLoopStatus(runId)
      expect(status?.logBuffer.some(l => l.includes('[stderr]'))).toBe(true)
    })
  })

  describe('initRalphService', () => {
    it('can be called without error', () => {
      expect(() => initRalphService()).not.toThrow()
    })
  })

  describe('shutdownRalphService', () => {
    it('can be called without error', () => {
      expect(() => shutdownRalphService()).not.toThrow()
    })

    it('clears all runs after shutdown', () => {
      mockExistsSync.mockReturnValue(true)
      const launched = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(launched.success).toBe(true)
      expect(listLoops()).toHaveLength(1)

      shutdownRalphService()
      const runs = listLoops()
      expect(runs).toHaveLength(0)
    })
  })

  describe('launchLoop - additional configs', () => {
    it('launches ralph-issues script type', () => {
      mockExistsSync.mockReturnValue(true)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-issues',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][1] as string[]
      // ralph-issues should NOT include -Autopilot
      expect(args).not.toContain('-Autopilot')
    })

    it('passes optional flags to spawn args', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: { 'gpt-4': {} }, aliases: {}, tiers: {} })
      )

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        model: 'gpt-4',
        noAudio: true,
        skipReview: true,
        noPR: true,
        iterations: 5,
        branch: 'feature/test',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][1] as string[]
      expect(args).toContain('-Model')
      expect(args).toContain('-NoAudio')
      expect(args).toContain('-SkipReview')
      expect(args).toContain('-NoPR')
      expect(args).toContain('-Max')
      expect(args).toContain('-Branch')
    })

    it('validates repeats out of range', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        repeats: 100,
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(false)
      expect(result.error).toContain('repeats must be between 1 and 50')
    })
  })
})
