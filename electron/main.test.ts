/**
 * Tests for electron/main.ts startup behavior.
 *
 * main.ts is an imperative entrypoint with top-level await. Its testable logic
 * (window geometry, config, telemetry) is extracted to individually-tested modules.
 * This test validates the module structure and lifecycle registration through
 * mocking of Electron APIs.
 */
import { describe, it, expect, vi } from 'vitest'

// Track lifecycle callbacks registered with app.on / app.whenReady
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const appOnCalls: [string, (...args: any[]) => any][] = []
let whenReadyCb: (() => void) | null = null

const mockWin = {
  webContents: { on: vi.fn(), send: vi.fn() },
  on: vi.fn(),
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1400, height: 900 })),
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      appOnCalls.push([event, handler])
    }),
    whenReady: vi.fn(() => ({
      then: (cb: () => void) => {
        whenReadyCb = cb
        return { catch: vi.fn() }
      },
    })),
    quit: vi.fn(),
    getVersion: vi.fn(() => '1.0.0-test'),
    commandLine: { appendSwitch: vi.fn() },
  },
  BrowserWindow: Object.assign(
    vi.fn(function () {
      return mockWin
    }),
    { getAllWindows: vi.fn(() => []) }
  ),
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
  screen: {
    getAllDisplays: vi.fn(() => []),
    getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })),
    getDisplayMatching: vi.fn(() => ({ id: 1, bounds: {}, workArea: {} })),
  },
}))

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/mock/dist-electron/main.js'),
}))

vi.mock('electron-window-state', () => ({
  default: vi.fn(() => ({ x: 100, y: 100, width: 1400, height: 900, manage: vi.fn() })),
}))

vi.mock('./telemetry', () => ({
  initTelemetry: vi.fn(async () => undefined),
  shutdownTelemetry: vi.fn(async () => undefined),
  emitLog: vi.fn(),
}))

vi.mock('./config', () => ({
  configManager: {
    migrateFromEnv: vi.fn(),
    getUiValue: vi.fn(() => undefined),
    setUiValue: vi.fn(),
  },
}))

vi.mock('./zoom', () => ({ loadZoomLevel: vi.fn(() => 1.0) }))
vi.mock('./menu', () => ({ buildMenu: vi.fn(() => ({})), registerKeyboardShortcuts: vi.fn() }))
vi.mock('./ipc', () => ({ registerAllHandlers: vi.fn() }))
const mockDispatcher = { start: vi.fn(), stop: vi.fn() }
vi.mock('./workers', () => ({
  getDispatcher: vi.fn(() => mockDispatcher),
  runOfflineSync: vi.fn(async () => ({
    runsCreated: 0,
    schedulesProcessed: 0,
    skipped: 0,
    errors: [],
  })),
}))
vi.mock('./services/copilotClient', () => ({ stopSharedClient: vi.fn() }))
vi.mock('./services/ralphService', () => ({
  initRalphService: vi.fn(),
  shutdownRalphService: vi.fn(),
}))
vi.mock('../src/utils/windowGeometry', () => ({
  resolveWindowBounds: vi.fn((state: { width: number; height: number }) => ({
    width: state.width,
    height: state.height,
  })),
}))

describe('main process lifecycle', () => {
  it('registers expected lifecycle hooks when imported', async () => {
    // Importing the module triggers top-level code
    await import('./main')

    const registeredEvents = appOnCalls.map(([event]) => event)
    expect(registeredEvents).toContain('window-all-closed')
    expect(whenReadyCb).toBeTypeOf('function')
  })

  it('whenReady callback executes the boot sequence', async () => {
    await import('./main')
    const { Menu } = await import('electron')
    const { registerAllHandlers } = await import('./ipc')
    const { configManager } = await import('./config')
    const { initRalphService } = await import('./services/ralphService')

    // Invoke the whenReady callback to exercise the boot path
    expect(whenReadyCb).not.toBeNull()
    whenReadyCb!()

    // Verify the boot sequence ran: config migration, menu, IPC, ralph
    expect(configManager.migrateFromEnv).toHaveBeenCalled()
    expect(Menu.setApplicationMenu).toHaveBeenCalled()
    expect(registerAllHandlers).toHaveBeenCalled()
    expect(initRalphService).toHaveBeenCalled()
  })

  it('window-all-closed handler calls app.quit on non-darwin', async () => {
    await import('./main')

    const { app } = await import('electron')
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    const windowAllClosedCb = appOnCalls.find(([e]) => e === 'window-all-closed')?.[1]
    expect(windowAllClosedCb).toBeDefined()
    windowAllClosedCb!()
    expect(app.quit).toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('before-quit handler stops dispatcher, shared client, ralph, and races telemetry shutdown', async () => {
    await import('./main')

    const { app } = await import('electron')
    const { stopSharedClient } = await import('./services/copilotClient')
    const { shutdownRalphService } = await import('./services/ralphService')
    const { shutdownTelemetry } = await import('./telemetry')

    const beforeQuitCb = appOnCalls.find(([e]) => e === 'before-quit')?.[1]
    expect(beforeQuitCb).toBeDefined()

    // Simulate the event object with preventDefault
    const event = { preventDefault: vi.fn() }
    beforeQuitCb!(event)

    // Verify sync cleanup calls
    expect(event.preventDefault).toHaveBeenCalled()
    expect(mockDispatcher.stop).toHaveBeenCalled()
    expect(stopSharedClient).toHaveBeenCalled()
    expect(shutdownRalphService).toHaveBeenCalled()

    // Verify telemetry shutdown is invoked (races with timeout before calling app.quit)
    expect(shutdownTelemetry).toHaveBeenCalled()

    // After the race resolves, app.quit() should be called
    await vi.waitFor(() => {
      expect(app.quit).toHaveBeenCalled()
    })
  })
})
