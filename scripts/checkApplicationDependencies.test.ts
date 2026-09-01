import { describe, expect, it, vi } from 'vitest'
import {
  checkApplicationDependencies,
  type CommandResult,
  type CommandRunner,
} from './checkApplicationDependencies'

const success = (): CommandResult => ({ status: 0, stdout: '1.44.0\n' })
const failure = (stderr: string): CommandResult => ({ status: 1, stderr })

function sequenceRunner(results: CommandResult[]): {
  runCommand: CommandRunner
  calls: Array<{ executable: string; args: string[] }>
} {
  const calls: Array<{ executable: string; args: string[] }> = []
  return {
    calls,
    runCommand(executable, args) {
      calls.push({ executable, args })
      const result = results.shift()
      if (!result) throw new Error('Unexpected command')
      return result
    },
  }
}

describe('application dependency preflight', () => {
  it('accepts a healthy repository-local Convex CLI without installing', () => {
    const runner = sequenceRunner([success()])

    expect(
      checkApplicationDependencies({
        bunExecutable: 'bun',
        runCommand: runner.runCommand,
      })
    ).toBe(true)
    expect(runner.calls).toEqual([
      { executable: 'bun', args: ['x', '--no-install', 'convex', '--version'] },
    ])
  })

  it.each([
    ['missing', 'error: package "convex" is not installed'],
    ['corrupt', 'error: could not find bin metadata file'],
  ])('rejects a %s local Convex CLI in fast mode with repair guidance', (_, detail) => {
    const runner = sequenceRunner([failure(detail)])
    const writeError = vi.fn()

    expect(
      checkApplicationDependencies({
        bunExecutable: 'bun',
        runCommand: runner.runCommand,
        writeError,
      })
    ).toBe(false)
    expect(runner.calls).toHaveLength(1)
    expect(writeError).toHaveBeenCalledWith(detail)
    expect(writeError).toHaveBeenCalledWith('Repair with: bun install --force --frozen-lockfile')
  })
})

describe('application dependency repair', () => {
  it('repairs a corrupt dependency tree and validates Convex again', () => {
    const runner = sequenceRunner([
      failure('error: could not find bin metadata file'),
      { status: 0 },
      success(),
    ])

    expect(
      checkApplicationDependencies({
        repair: true,
        bunExecutable: 'bun',
        runCommand: runner.runCommand,
      })
    ).toBe(true)
    expect(runner.calls).toEqual([
      { executable: 'bun', args: ['x', '--no-install', 'convex', '--version'] },
      { executable: 'bun', args: ['install', '--force', '--frozen-lockfile'] },
      { executable: 'bun', args: ['x', '--no-install', 'convex', '--version'] },
    ])
  })

  it('fails when the forced frozen-lockfile repair fails', () => {
    const runner = sequenceRunner([
      failure('error: could not find bin metadata file'),
      failure('install failed'),
    ])
    const writeError = vi.fn()

    expect(
      checkApplicationDependencies({
        repair: true,
        bunExecutable: 'bun',
        runCommand: runner.runCommand,
        writeError,
      })
    ).toBe(false)
    expect(runner.calls).toHaveLength(2)
    expect(writeError).toHaveBeenCalledWith('ERROR: bun install --force --frozen-lockfile failed.')
  })

  it('fails when Convex remains unusable after repair', () => {
    const runner = sequenceRunner([
      failure('error: could not find bin metadata file'),
      { status: 0 },
      failure('error: still corrupt'),
    ])
    const writeError = vi.fn()

    expect(
      checkApplicationDependencies({
        repair: true,
        bunExecutable: 'bun',
        runCommand: runner.runCommand,
        writeError,
      })
    ).toBe(false)
    expect(runner.calls).toHaveLength(3)
    expect(writeError).toHaveBeenCalledWith(
      'ERROR: The repository-local Convex CLI is still unusable after repair.'
    )
  })
})
