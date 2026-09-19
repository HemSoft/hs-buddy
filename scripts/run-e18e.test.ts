// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { runE18e } from './run-e18e'

const state = vi.hoisted(() => ({
  placeholder: true,
  version: '0.7.0',
  stdout: '',
  stderr: '',
  status: 0 as number | null,
  signal: null as NodeJS.Signals | null,
  error: undefined as Error | undefined,
}))
vi.mock('node:child_process', () => {
  const module = {
    spawnSync: vi.fn(() => ({
      status: state.status,
      signal: state.signal,
      error: state.error,
      stdout: state.stdout,
      stderr: state.stderr,
    })),
  }
  return { ...module, default: module }
})
vi.mock('node:fs', () => {
  const module = {
    rmSync: vi.fn(),
    readFileSync: vi.fn((path: string) =>
      JSON.stringify(
        path.includes('node_modules')
          ? { version: state.version }
          : { name: 'example', version: '1.0.0', devDependencies: { '@e18e/cli': '0.7.0' } }
      )
    ),
  }
  return { ...module, default: module }
})
vi.mock('./e18e-placeholder', () => ({ createE18ePlaceholder: () => state.placeholder }))

const finding = (message: string, severity = 'warning') => ({ message, severity, score: 1 })
const report = (messages: unknown[] = []) =>
  JSON.stringify({
    stats: {
      name: 'example',
      version: '1.0.0',
      dependencyCount: { production: 2, development: 3 },
      extraStats: [{ name: 'duplicateDependencyCount', value: messages.length }],
    },
    messages,
  })

beforeEach(() => {
  Object.assign(state, {
    placeholder: true,
    version: '0.7.0',
    stdout: report(),
    stderr: '',
    status: 0,
    signal: null,
    error: undefined,
  })
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

test('executes the installed analyzer without a download and cleans up its placeholder', () => {
  expect(runE18e()).toBe(0)
  expect(spawnSync).toHaveBeenCalledWith(
    'node',
    expect.arrayContaining(['analyze', '--json']),
    expect.objectContaining({ timeout: 300_000, maxBuffer: 32 * 1024 * 1024 })
  )
  expect(console.log).toHaveBeenCalledWith('e18e analyzer version: 0.7.0')
  expect(rmSync).toHaveBeenCalledWith(expect.stringMatching(/dist-electron[/\\]main\.js$/), {
    force: true,
  })
})

test('preserves an existing Electron bundle', () => {
  state.placeholder = false
  expect(runE18e()).toBe(0)
  expect(rmSync).not.toHaveBeenCalled()
})

test('permits transitive warnings and documented direct exceptions', () => {
  state.stdout = report([
    finding('[duplicate dependency] transitive has 2 installed versions: parent@1'),
    finding('[duplicate dependency] typescript has 2 installed versions: root@1'),
    finding('other transitive warning'),
    finding('optional suggestion', 'suggestion'),
  ])
  expect(runE18e()).toBe(0)
  expect(console.log).toHaveBeenCalledWith('documented direct dependency exceptions: typescript')
})

test('rejects an undocumented direct duplicate and strips ANSI decorations', () => {
  state.stdout = report([
    finding(
      `\u001b[31m[duplicate dependency] new-direct has 2 installed versions: root@1\u001b[0m`
    ),
  ])
  expect(runE18e()).toBe(1)
  expect(console.log).toHaveBeenCalledWith('undocumented direct dependency findings: new-direct')
})

test('rejects error findings even when the analyzer incorrectly exits zero', () => {
  state.stdout = report([finding('invalid package metadata', 'error')])
  expect(runE18e()).toBe(1)
  expect(console.error).toHaveBeenCalledWith('invalid package metadata')
})

test.each(['', 'not JSON', '{}', '{"messages":[]}'])(
  'invalid report %s fails and cleans up',
  stdout => {
    state.stdout = stdout
    expect(() => runE18e()).toThrow()
    expect(rmSync).toHaveBeenCalledOnce()
  }
)

test.each([
  { status: 23, stdout: '' },
  { status: 23, stdout: report() },
  { status: null, signal: 'SIGTERM' },
  { status: null, error: new Error('ETIMEDOUT') },
  { status: null, error: new Error('ENOBUFS') },
  { status: null, error: new Error('ENOENT') },
])('process failure cannot qualify dependencies: %j', failure => {
  Object.assign(state, failure)
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  expect(() => runE18e()).toThrow()
  expect(rmSync).toHaveBeenCalledOnce()
})

test('reports stderr diagnostics without turning successful warnings into failures', () => {
  state.stderr = 'diagnostic\n'
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  expect(runE18e()).toBe(0)
  expect(write).toHaveBeenCalledWith('diagnostic\n')
})

test('fails when the installed analyzer differs from the exact manifest pin', () => {
  state.version = '9.0.0'
  expect(() => runE18e()).toThrow('exact manifest pin')
  expect(spawnSync).not.toHaveBeenCalled()
  expect(rmSync).toHaveBeenCalledOnce()
})
