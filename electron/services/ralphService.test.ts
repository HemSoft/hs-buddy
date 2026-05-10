import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSpawn = vi.fn().mockReturnValue({
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
})

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
      const modelsData = { models: { 'gpt-4': {} }, aliases: {}, tiers: {} }
      mockReadFileSync.mockReturnValue(JSON.stringify(modelsData))

      const result = getConfig('models')
      expect(result).toEqual(modelsData)
    })

    it('reads agents config', () => {
      mockExistsSync.mockReturnValue(true)
      const agentsData = { agents: ['copilot'] }
      mockReadFileSync.mockReturnValue(JSON.stringify(agentsData))

      const result = getConfig('agents')
      expect(result).toEqual(agentsData)
    })

    it('reads providers config', () => {
      mockExistsSync.mockReturnValue(true)
      const providersData = { providers: ['copilot'] }
      mockReadFileSync.mockReturnValue(JSON.stringify(providersData))

      const result = getConfig('providers')
      expect(result).toEqual(providersData)
    })

    it('throws when config file not found', () => {
      mockExistsSync.mockImplementation((p: string) => {
        // Scripts dir exists, but config file does not
        if (typeof p === 'string' && p.includes('config')) return false
        return true
      })

      expect(() => getConfig('models')).toThrow('Config file not found')
    })
  })

  describe('initRalphService', () => {
    it('does not throw when no active runs exist', () => {
      expect(() => initRalphService()).not.toThrow()
    })
  })

  describe('shutdownRalphService', () => {
    it('does not throw when no active processes exist', () => {
      expect(() => shutdownRalphService()).not.toThrow()
    })
  })

  describe('stopLoop with active process', () => {
    it('stops a running process and updates status', () => {
      mockExistsSync.mockReturnValue(true)
      const statusCallback = vi.fn()
      setStatusChangeCallback(statusCallback)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(true)
      const runId = result.runId!

      // Verify it shows as running
      const status = getLoopStatus(runId)
      expect(status).not.toBeNull()
      expect(status!.status).toBe('running')

      // Stop it
      const stopResult = stopLoop(runId)
      expect(stopResult.success).toBe(true)

      // Verify status is updated
      const afterStop = getLoopStatus(runId)
      expect(afterStop!.status).toBe('cancelled')
    })

    it('returns error when run is not running', () => {
      mockExistsSync.mockReturnValue(true)
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      // Stop it first
      stopLoop(runId)
      // Try stopping again
      const secondStop = stopLoop(runId)
      expect(secondStop.success).toBe(false)
      expect(secondStop.error).toContain('is not running')
    })
  })

  describe('output parsing via process events', () => {
    it('handles stdout data events with output parsing', () => {
      mockExistsSync.mockReturnValue(true)
      const statusCallback = vi.fn()
      setStatusChangeCallback(statusCallback)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 99999,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(true)
      const runId = result.runId!

      // Get the stdout 'data' callback
      const stdoutOnCalls = mockProcess.stdout.on.mock.calls
      const dataCallback = stdoutOnCalls.find((c: unknown[]) => c[0] === 'data')?.[1]
      expect(dataCallback).toBeDefined()

      // Simulate iteration marker
      dataCallback(Buffer.from('=== ITERATION 3 ===\n'))

      const status = getLoopStatus(runId)
      expect(status!.currentIteration).toBe(3)
      expect(status!.phase).toBe('iterating')
      expect(statusCallback).toHaveBeenCalled()
    })

    it('handles process close event', () => {
      mockExistsSync.mockReturnValue(true)
      const statusCallback = vi.fn()
      setStatusChangeCallback(statusCallback)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 88888,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      // Get the 'close' callback
      const onCalls = mockProcess.on.mock.calls
      const closeCallback = onCalls.find((c: unknown[]) => c[0] === 'close')?.[1]
      expect(closeCallback).toBeDefined()

      // Simulate process close with exit code 0
      closeCallback(0)

      const status = getLoopStatus(runId)
      expect(status!.status).toBe('completed')
    })

    it('handles process error event', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 77777,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      // Get the 'error' callback
      const onCalls = mockProcess.on.mock.calls
      const errorCallback = onCalls.find((c: unknown[]) => c[0] === 'error')?.[1]
      expect(errorCallback).toBeDefined()

      errorCallback(new Error('ENOENT'))

      const status = getLoopStatus(runId)
      expect(status!.status).toBe('failed')
      expect(status!.error).toContain('ENOENT')
    })

    it('detects pr-handoff phase', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 66666,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      const dataCallback = mockProcess.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1]
      dataCallback(Buffer.from('Handing off to ralph-pr\n'))

      expect(getLoopStatus(runId)!.phase).toBe('pr-handoff')
    })

    it('detects pr-resolving phase', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 55555,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      const dataCallback = mockProcess.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1]
      dataCallback(Buffer.from('PR review cycle starting\n'))

      expect(getLoopStatus(runId)!.phase).toBe('pr-resolving')
    })

    it('tracks stat matchers for checks and agent turns', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 44444,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      const dataCallback = mockProcess.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1]

      dataCallback(Buffer.from('== Check 1 of 5\n'))
      expect(getLoopStatus(runId)!.stats.checks).toBe(1)

      dataCallback(Buffer.from('AGENT REVIEW [copilot]\n'))
      expect(getLoopStatus(runId)!.stats.agentTurns).toBe(1)

      dataCallback(Buffer.from('Copilot review requested\n'))
      expect(getLoopStatus(runId)!.stats.copilotPRs).toBe(1)

      dataCallback(Buffer.from('review round 1\n'))
      expect(getLoopStatus(runId)!.stats.reviews).toBe(1)
    })

    it('tracks cost stats', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 33333,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      const dataCallback = mockProcess.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1]

      dataCallback(Buffer.from('  Cost $1.50 (10 premium requests)\n'))
      const status = getLoopStatus(runId)!
      expect(status.stats.totalCost).toBe('$1.50')
      expect(status.stats.totalPremium).toBe(10)
    })

    it('detects scan iteration markers', () => {
      mockExistsSync.mockReturnValue(true)

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        pid: 22222,
      }
      mockSpawn.mockReturnValueOnce(mockProcess)

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      const runId = result.runId!

      const dataCallback = mockProcess.stdout.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'data'
      )?.[1]

      dataCallback(Buffer.from('== Scan Iteration 2/5\n'))
      const status = getLoopStatus(runId)!
      expect(status.phase).toBe('scanning')
      expect(status.stats.scanIterations).toBe(1)
    })
  })
})
