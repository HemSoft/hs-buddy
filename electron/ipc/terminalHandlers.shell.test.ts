import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  spawn: vi.fn(),
  exists: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, on: vi.fn() },
  app: { getPath: () => 'C:\\home', on: vi.fn() },
}))
vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs', () => ({
  existsSync: mocks.exists,
  statSync: mocks.stat,
  accessSync: mocks.access,
  constants: { R_OK: 4, X_OK: 1 },
  realpathSync: { native: vi.fn() },
}))
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      (name: string) => {
        if (name === 'node-pty') return { spawn: mocks.spawn }
        if (name === 'node-pty/lib/utils') return { loadNativeModule: vi.fn() }
        throw new Error(`Unexpected native module: ${name}`)
      },
      { resolve: () => '/fake/node-pty/package.json' }
    ),
}))
vi.mock('../../src/utils/terminalPathUtils', () => ({
  buildTerminalShellArgs: () => ['-NoLogo'],
  buildTerminalStartupCommand: (): undefined => {},
  buildPtySpawnOptions: () => ({ env: {} }),
  POWERSHELL_STARTUP_SCRIPT_ENV: 'HS_BUDDY_STARTUP_SCRIPT',
}))

const originalPlatform = process.platform
let spawnHandler: (event: unknown, opts: unknown) => Promise<{ success: boolean }>

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  vi.stubEnv('SystemRoot', 'C:\\Windows')
  vi.stubEnv('WINDIR', undefined)
  mocks.exists.mockReturnValue(true)
  mocks.stat.mockImplementation((candidate: string) => ({
    isFile: () => candidate.endsWith('.exe'),
    isDirectory: () => !candidate.endsWith('.exe'),
  }))
  mocks.spawn.mockReturnValue({
    onData: () => ({ dispose: vi.fn() }),
    onExit: () => ({ dispose: vi.fn() }),
    kill: vi.fn(),
  })
  const { registerTerminalHandlers } = await import('./terminalHandlers')
  registerTerminalHandlers()
  spawnHandler = mocks.handle.mock.calls.find(call => call[0] === 'terminal:spawn')![1]
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  vi.unstubAllEnvs()
})

async function expectShell(shell: string) {
  expect(
    await spawnHandler(
      { sender: { isDestroyed: () => false, send: vi.fn() } },
      { cwd: 'C:\\repo', cols: 80, rows: 24 }
    )
  ).toMatchObject({ success: true })
  expect(mocks.spawn).toHaveBeenLastCalledWith(shell, ['-NoLogo'], { env: {} })
}

function executableProbes() {
  return mocks.exists.mock.calls.filter(([candidate]) => String(candidate).endsWith('.exe'))
}

it.each([undefined, ''])(
  'uses the hardcoded fallback without searching an unset/empty PATH %j',
  async value => {
    vi.stubEnv('PATH', value)
    await expectShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    await expectShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(executableProbes()).toEqual([])
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
  }
)

it('skips blank, nonexistent, directory, inaccessible and throwing entries before a quoted executable directory', async () => {
  vi.stubEnv(
    'PATH',
    '; ;"";C:\\missing;C:\\directory;C:\\denied;C:\\throws;"C:\\Program Files\\PowerShell\\7"'
  )
  mocks.exists.mockImplementation((candidate: string) => {
    if (candidate === 'C:\\throws\\pwsh.exe') throw new Error('stat permission denied')
    return candidate !== 'C:\\missing\\pwsh.exe'
  })
  mocks.stat.mockImplementation((candidate: string) => ({
    isFile: () => candidate.endsWith('.exe') && candidate !== 'C:\\directory\\pwsh.exe',
    isDirectory: () => !candidate.endsWith('.exe'),
  }))
  mocks.access.mockImplementation((candidate: string) => {
    if (candidate === 'C:\\denied\\pwsh.exe') throw new Error('not executable')
  })
  await expectShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  expect(executableProbes().map(([candidate]) => candidate)).toEqual([
    'C:\\missing\\pwsh.exe',
    'C:\\directory\\pwsh.exe',
    'C:\\denied\\pwsh.exe',
    'C:\\throws\\pwsh.exe',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  ])
  expect(mocks.access).toHaveBeenCalledWith('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 1)
  const probes = executableProbes().length
  await expectShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  expect(executableProbes()).toHaveLength(probes)
})

it('caches misses for both executable names but searches again when PATH changes', async () => {
  vi.stubEnv('PATH', 'C:\\missing')
  mocks.exists.mockImplementation((candidate: string) => !candidate.endsWith('.exe'))
  await expectShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  expect(executableProbes().map(([candidate]) => candidate)).toEqual([
    'C:\\missing\\pwsh.exe',
    'C:\\missing\\powershell.exe',
  ])
  await expectShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  expect(executableProbes()).toHaveLength(2)
  vi.stubEnv('PATH', 'C:\\installed')
  mocks.exists.mockReturnValue(true)
  await expectShell('C:\\installed\\pwsh.exe')
  expect(executableProbes()).toHaveLength(3)
})

it('prefers PowerShell 7 over legacy PowerShell and invalidates cached hits when PATH changes', async () => {
  vi.stubEnv('PATH', 'C:\\first')
  await expectShell('C:\\first\\pwsh.exe')
  expect(executableProbes().map(([candidate]) => candidate)).toEqual(['C:\\first\\pwsh.exe'])
  vi.stubEnv('PATH', 'C:\\second')
  await expectShell('C:\\second\\pwsh.exe')
  expect(executableProbes().map(([candidate]) => candidate)).toEqual([
    'C:\\first\\pwsh.exe',
    'C:\\second\\pwsh.exe',
  ])
})

it('falls back to a validated legacy PowerShell when PowerShell 7 is absent', async () => {
  vi.stubEnv('PATH', 'C:\\legacy')
  mocks.exists.mockImplementation((candidate: string) => !candidate.endsWith('pwsh.exe'))
  await expectShell('C:\\legacy\\powershell.exe')
  expect(executableProbes().map(([candidate]) => candidate)).toEqual([
    'C:\\legacy\\pwsh.exe',
    'C:\\legacy\\powershell.exe',
  ])
  expect(mocks.access).toHaveBeenCalledWith('C:\\legacy\\powershell.exe', 1)
})

it.each([
  ['D:\\Windows', 'E:\\Windows', 'D:\\Windows'],
  ['', 'E:\\Windows', 'E:\\Windows'],
  [undefined, undefined, 'C:\\Windows'],
] as const)(
  'uses SystemRoot %j then WINDIR %j then the Windows default',
  async (systemRoot, windir, expected) => {
    vi.stubEnv('PATH', '')
    vi.stubEnv('SystemRoot', systemRoot)
    vi.stubEnv('WINDIR', windir)
    await expectShell(
      path.win32.join(expected, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    )
    expect(executableProbes()).toEqual([])
  }
)
