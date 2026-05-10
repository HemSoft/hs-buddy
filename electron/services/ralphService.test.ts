import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

function createMockProcess() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    kill: vi.fn(),
    pid: 12345,
  })
  return proc
}

let lastMockProc: ReturnType<typeof createMockProcess>

const mockSpawn = vi.fn(() => {
  lastMockProc = createMockProcess()
  return lastMockProc
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

    it('filters out repeat and run-all scripts', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue([
        'ralph-issues.ps1',
        'ralph-repeat.ps1',
        'ralph-run-all.ps1',
      ])
      mockReadFileSync.mockReturnValue('# simple script')

      const scripts = listTemplateScripts()
      expect(scripts).toHaveLength(1)
      expect(scripts[0].filename).toBe('ralph-issues.ps1')
    })

    it('returns undefined for description when script has no leading comments', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-simple.ps1'])
      mockReadFileSync.mockReturnValue('param($Name)\nWrite-Host "Hello"')

      const scripts = listTemplateScripts()
      expect(scripts[0].description).toBeUndefined()
    })

    it('returns undefined for prompt when readScriptContent fails', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-test.ps1'])
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('ralph-test.ps1')) throw new Error('ENOENT')
        return '{}'
      })

      const scripts = listTemplateScripts()
      expect(scripts[0].defaultPrompt).toBeUndefined()
      expect(scripts[0].description).toBeUndefined()
    })

    it('skips leading blank lines before comments', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-blanks.ps1'])
      // Leading blank lines then a comment block followed by blank line
      mockReadFileSync.mockReturnValue(
        '\n\n# ralph-blanks — Blank line test\n# Description text here\n\nparam($x)'
      )

      const scripts = listTemplateScripts()
      expect(scripts[0].description).toBe('Blank line test')
    })

    it('stops reading comments at first blank line after comments', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['ralph-stop.ps1'])
      // Comments → blank line → more comments (should be ignored)
      mockReadFileSync.mockReturnValue(
        '# ralph-stop — Stop test\n# First desc\n\n# Second block (should not appear)'
      )

      const scripts = listTemplateScripts()
      expect(scripts[0].description).toBe('Stop test')
    })
  })

  describe('getConfig', () => {
    it('reads models config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{"models":{},"aliases":{},"tiers":{}}')

      const result = getConfig('models')
      expect(result).toEqual({ models: {}, aliases: {}, tiers: {} })
    })

    it('reads agents config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{"agents":["a1"]}')

      const result = getConfig('agents')
      expect(result).toEqual({ agents: ['a1'] })
    })

    it('reads providers config', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('{"providers":["p1"]}')

      const result = getConfig('providers')
      expect(result).toEqual({ providers: ['p1'] })
    })

    it('throws when config file not found', () => {
      mockExistsSync.mockImplementation((p: string) => {
        // Scripts dir exists, but config file does not
        if (p.includes('config')) return false
        return true
      })

      expect(() => getConfig('models')).toThrow('Config file not found')
    })
  })

  describe('launchLoop - process events', () => {
    function launchValid() {
      mockExistsSync.mockReturnValue(true)
      const modelsConfig = {
        models: { 'gpt-4': {} },
        aliases: {},
        tiers: {},
      }
      mockReadFileSync.mockReturnValue(JSON.stringify(modelsConfig))

      return launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
    }

    it('emits status change on process close with exit code 0', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      const result = launchValid()
      expect(result.success).toBe(true)

      // Simulate process exit
      lastMockProc.emit('close', 0)

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          exitCode: 0,
        })
      )
      setStatusChangeCallback(null)
    })

    it('sets status to failed on non-zero exit code', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.emit('close', 1)

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          exitCode: 1,
        })
      )
      setStatusChangeCallback(null)
    })

    it('handles process error event', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.emit('error', new Error('spawn ENOENT'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'spawn ENOENT',
        })
      )
      setStatusChangeCallback(null)
    })

    it('parses stdout iteration markers', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('=== ITERATION 3 ===\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          currentIteration: 3,
          phase: 'iterating',
        })
      )
      setStatusChangeCallback(null)
    })

    it('parses stdout stderr data', () => {
      launchValid()
      // Should not throw
      lastMockProc.stderr.emit('data', Buffer.from('[stderr] error line\n'))

      const runs = listLoops()
      expect(runs[0].logBuffer).toEqual(expect.arrayContaining([expect.stringContaining('stderr')]))
    })

    it('tracks check stats from output', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('== Check 1 of 5\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ checks: 1 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks copilot PR stats from output', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('Copilot review requested\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ copilotPRs: 1 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks review round stats from output', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('review round 2\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ reviews: 1 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks total cost from output', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit(
        'data',
        Buffer.from('  Cost $12.34 (56 premium requests used)\n')
      )

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ totalCost: '$12.34', totalPremium: 56 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks GRAND TOTAL cost', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit(
        'data',
        Buffer.from('GRAND TOTAL: $99.99 (100 premium requests)\n')
      )

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ totalCost: '$99.99', totalPremium: 100 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('detects pr-handoff phase', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('Handing off to ralph-pr\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'pr-handoff' })
      )
      setStatusChangeCallback(null)
    })

    it('detects pr-resolving phase', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('PR review cycle starting\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'pr-resolving' })
      )
      setStatusChangeCallback(null)
    })

    it('detects scanning phase for ralph-issues', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('== Scan Iteration 1/5\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'scanning',
          stats: expect.objectContaining({ scanIterations: 1 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks issues created stat', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('Issues created this iteration: 3\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ issuesCreated: 3 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('tracks agent review turns from output', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      lastMockProc.stdout.emit('data', Buffer.from('AGENT REVIEW [round 1]\n'))

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.objectContaining({ agentTurns: 1 }),
        })
      )
      setStatusChangeCallback(null)
    })

    it('trims log buffer at MAX_LOG_BUFFER', () => {
      launchValid()
      // Emit 5001+ lines (MAX_LOG_BUFFER is 5000)
      const bigData = Array.from({ length: 5010 }, (_, i) => `line-${i}`).join('\n')
      lastMockProc.stdout.emit('data', Buffer.from(bigData))

      const runs = listLoops()
      const run = runs.find(r => r.runId === 'test-uuid-1234')
      expect(run!.logBuffer.length).toBeLessThanOrEqual(5000)
    })

    it('does not overwrite cancelled status on close', () => {
      const cb = vi.fn()
      setStatusChangeCallback(cb)

      launchValid()
      const runs = listLoops()
      const run = runs.find(r => r.runId === 'test-uuid-1234')!
      run.status = 'cancelled'

      lastMockProc.emit('close', 1)

      // Status should remain 'cancelled', not overwritten to 'failed'
      expect(run.status).toBe('cancelled')
      setStatusChangeCallback(null)
    })
  })

  describe('launchLoop - argument building', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          models: { 'gpt-4': {} },
          aliases: { fast: 'gpt-4' },
          tiers: { low: 'gpt-4' },
        })
      )
    })

    it('builds args for ralph-pr with devAgent and agents', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-pr',
        prNumber: 42,
        devAgent: 'claude',
        agents: ['gpt-4', 'gemini'],
        model: 'gpt-4',
        provider: 'copilot',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith(
        'pwsh',
        expect.arrayContaining([
          '-DevAgent',
          'claude',
          '-Agents',
          'gpt-4,gemini',
          '-Model',
          'gpt-4',
          '-Provider',
          'copilot',
          '-PRNumber',
          '42',
        ]),
        expect.anything()
      )
    })

    it('builds args with repeat wrapper when repeats > 1', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        repeats: 3,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-Times')
      expect(args).toContain('3')
    })

    it('appends boolean flags', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        noAudio: true,
        skipReview: true,
        autoApprove: true,
        noPR: true,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(true)
      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-NoAudio')
      expect(args).toContain('-SkipReview')
      expect(args).toContain('-AutoApprove')
      expect(args).toContain('-NoPR')
    })

    it('appends workUntil and branch args', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        workUntil: '17:00',
        branch: 'feature/test',
        iterations: 5,
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-WorkUntil')
      expect(args).toContain('17:00')
      expect(args).toContain('-Branch')
      expect(args).toContain('feature/test')
      expect(args).toContain('-Max')
      expect(args).toContain('5')
    })

    it('writes long prompt to temp file', () => {
      const longPrompt = 'a'.repeat(600)
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        prompt: longPrompt,
      } as Parameters<typeof launchLoop>[0])

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/ralph-prompt-/),
        longPrompt,
        'utf-8'
      )
    })

    it('writes multiline prompt to temp file', () => {
      const multilinePrompt = 'line 1\nline 2\nline 3'
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        prompt: multilinePrompt,
      } as Parameters<typeof launchLoop>[0])

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/ralph-prompt-/),
        multilinePrompt,
        'utf-8'
      )
    })

    it('passes short prompt directly as arg', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        prompt: 'Fix the bug',
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-Prompt')
      expect(args).toContain('Fix the bug')
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('adds -Labels arg when labels are specified', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        labels: 'bug,enhancement',
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-Labels')
      expect(args).toContain('bug,enhancement')
    })

    it('adds -DryRun flag', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        dryRun: true,
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-DryRun')
    })

    it('resolves ralph-issues script path', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph-issues',
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      const fileArg = args[args.indexOf('-File') + 1]
      expect(fileArg).toContain('ralph-issues.ps1')
      // ralph-issues does NOT get -Autopilot
      expect(args).not.toContain('-Autopilot')
    })

    it('resolves template script from vendored path', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'template',
        templateScript: 'my-template.ps1',
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      const fileArg = args[args.indexOf('-File') + 1]
      expect(fileArg).toContain('my-template.ps1')
    })

    it('returns error for template script not found', () => {
      mockExistsSync.mockImplementation((p: string) => {
        // Scripts dir exists, but template script does not
        if (typeof p === 'string' && p.includes('my-missing')) return false
        return true
      })

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'template',
        templateScript: 'my-missing.ps1',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Template script not found')
    })

    it('returns error for invalid provider', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        provider: 'invalid-provider' as 'copilot',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid provider')
    })

    it('returns error for invalid model', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        model: 'nonexistent-model',
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown model')
    })

    it('returns error for repeats out of range', () => {
      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        repeats: 100,
      } as Parameters<typeof launchLoop>[0])

      expect(result.success).toBe(false)
      expect(result.error).toContain('repeats must be between 1 and 50')
    })

    it('combines devAgent into agents for non-ralph-pr scripts', () => {
      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
        devAgent: 'claude',
        agents: ['gemini'],
      } as Parameters<typeof launchLoop>[0])

      const args = mockSpawn.mock.calls[0][1] as string[]
      expect(args).toContain('-Agents')
      expect(args).toContain('claude,gemini')
    })
  })

  describe('stopLoop - with active process', () => {
    it('kills process tree on Windows and sets status to cancelled', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          models: { 'gpt-4': {} },
          aliases: {},
          tiers: {},
        })
      )

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(true)

      const cb = vi.fn()
      setStatusChangeCallback(cb)

      const stopResult = stopLoop('test-uuid-1234')
      expect(stopResult.success).toBe(true)

      const status = getLoopStatus('test-uuid-1234')
      expect(status?.status).toBe('cancelled')
      setStatusChangeCallback(null)
    })

    it('returns error when run is not running', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: {}, aliases: {}, tiers: {} })
      )

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      // Simulate process exit first
      lastMockProc.emit('close', 0)

      const result = stopLoop('test-uuid-1234')
      expect(result.success).toBe(false)
      expect(result.error).toContain('is not running')
    })

    it('returns error when kill throws', async () => {
      const { execSync } = await import('child_process')
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: {}, aliases: {}, tiers: {} })
      )

      const result = launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])
      expect(result.success).toBe(true)

      // Make execSync throw when taskkill is called
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('Access denied')
      })

      const cb = vi.fn()
      setStatusChangeCallback(cb)

      const stopResult = stopLoop('test-uuid-1234')
      expect(stopResult.success).toBe(false)
      expect(stopResult.error).toContain('Failed to stop')
      expect(stopResult.error).toContain('Access denied')

      const status = getLoopStatus('test-uuid-1234')
      expect(status?.status).toBe('failed')
      setStatusChangeCallback(null)
    })
  })

  describe('initRalphService', () => {
    it('marks lingering running entries as orphaned', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: {}, aliases: {}, tiers: {} })
      )

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      initRalphService()

      const status = getLoopStatus('test-uuid-1234')
      expect(status?.status).toBe('orphaned')
    })
  })

  describe('shutdownRalphService', () => {
    it('stops all active processes and clears state', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ models: {}, aliases: {}, tiers: {} })
      )

      launchLoop({
        repoPath: '/valid/path',
        scriptType: 'ralph',
      } as Parameters<typeof launchLoop>[0])

      shutdownRalphService()

      expect(listLoops()).toHaveLength(0)
    })
  })
})
