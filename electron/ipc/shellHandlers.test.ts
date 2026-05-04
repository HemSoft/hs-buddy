import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture event handlers registered on webContents
type EventCallback = (...args: unknown[]) => void

let webContentsListeners: Map<string, EventCallback>
let windowOpenHandler: (({ url }: { url: string }) => { action: string }) | null
let mockLoadURL: ReturnType<typeof vi.fn>
let mockIsDestroyed: ReturnType<typeof vi.fn>

// Module-level loadURL response override — set before calling invoke to control
// the behavior of BrowserWindow.loadURL() in the handler under test.
let loadURLResponse: Promise<void> = Promise.resolve()

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    webContents = {
      on: vi.fn((event: string, cb: EventCallback) => {
        webContentsListeners.set(event, cb)
      }),
      setWindowOpenHandler: vi.fn((handler: typeof windowOpenHandler) => {
        windowOpenHandler = handler
      }),
      getURL: vi.fn(() => 'https://example.com/page'),
    }
    setMenuBarVisibility = vi.fn()
    loadURL = (() => {
      const fn = vi.fn(() => loadURLResponse)
      mockLoadURL = fn
      return fn
    })()
    setTitle = vi.fn()
    isDestroyed = (() => {
      const fn = vi.fn(() => false)
      mockIsDestroyed = fn
      return fn
    })()
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34' }]),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
}))

vi.mock('../../src/utils/networkSecurity', () => ({
  isPrivateIP: vi.fn(
    (ip: string) => ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1'
  ),
  extractPageTitle: vi.fn((html: string) => {
    const match = html.match(/<title>(.*?)<\/title>/i)
    return match ? match[1] : null
  }),
  validateUrl: vi.fn((url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http/https URLs supported')
    }
    return parsed
  }),
}))

vi.mock('../telemetry', () => ({
  recordWindowOpen: vi.fn(),
}))

vi.mock('../utils', () => ({
  execAsync: vi.fn(),
}))

import { ipcMain, shell } from 'electron'
import { registerShellHandlers } from './shellHandlers'

describe('shellHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    webContentsListeners = new Map()
    windowOpenHandler = null
    loadURLResponse = Promise.resolve()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerShellHandlers()
  })

  it('registers expected channels', () => {
    expect(handlers.has('shell:open-external')).toBe(true)
    expect(handlers.has('shell:open-in-app-browser')).toBe(true)
    expect(handlers.has('shell:fetch-page-title')).toBe(true)
    expect(handlers.has('system:get-fonts')).toBe(true)
  })

  describe('shell:open-external', () => {
    const invoke = (url: string) => handlers.get('shell:open-external')!({}, url)

    it('opens URL in system browser', async () => {
      const result = await invoke('https://example.com')
      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com')
      expect(result).toEqual({ success: true })
    })

    it('opens mailto links without SSRF validation', async () => {
      const result = await invoke('mailto:user@example.com')
      expect(shell.openExternal).toHaveBeenCalledWith('mailto:user@example.com')
      expect(result).toEqual({ success: true })
    })

    it('rejects disallowed protocols', async () => {
      const result = await invoke('file:///etc/passwd')
      expect(result).toEqual({
        success: false,
        error: 'Only http, https, and mailto URLs are allowed',
      })
      expect(shell.openExternal).not.toHaveBeenCalled()
    })

    it('returns error when shell.openExternal fails', async () => {
      vi.mocked(shell.openExternal).mockRejectedValue(new Error('Permission denied'))
      const result = await invoke('https://example.com')
      expect(result).toEqual({ success: false, error: 'Permission denied' })
    })

    it('rejects internal hostnames for http/https URLs (SSRF protection)', async () => {
      const { validateUrl } = await import('../../src/utils/networkSecurity')
      vi.mocked(validateUrl).mockImplementationOnce(() => {
        throw new Error('Internal URLs not allowed')
      })

      const result = await invoke('https://localhost/admin')
      expect(result).toEqual({ success: false, error: 'Internal URLs not allowed' })
      expect(shell.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('shell:open-in-app-browser', () => {
    const invoke = (url: string, title?: string) =>
      handlers.get('shell:open-in-app-browser')!({}, url, title)

    it('rejects non-http URLs', async () => {
      const result = await invoke('file:///etc/passwd')
      expect(result).toEqual({ success: false, error: expect.stringContaining('http') })
    })

    it('opens valid URL in browser window', async () => {
      const result = await invoke('https://example.com', 'Example')
      expect(result).toEqual({ success: true })
    })

    it('rejects URLs that resolve to private IPs (SSRF protection)', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValue([{ address: '192.168.1.100' }] as never)

      const result = await invoke('https://evil.com')
      expect(result).toEqual({ success: false, error: 'Internal URLs not allowed' })
    })

    it('registers will-redirect handler that blocks private IP redirects', async () => {
      const { lookup } = await import('node:dns/promises')
      // First call: initial URL passes (public IP)
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      // A will-redirect handler should have been registered
      const redirectHandler = webContentsListeners.get('will-redirect')
      expect(redirectHandler).toBeDefined()

      // Simulate a redirect to a private IP
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.1' }] as never)
      const event = { preventDefault: vi.fn() }
      redirectHandler!(event, 'http://10.0.0.1/internal')

      expect(event.preventDefault).toHaveBeenCalled()
      // Wait for the async validation to complete
      await vi.waitFor(() => {
        // loadURL should NOT have been called again with the private URL
        expect(mockLoadURL).not.toHaveBeenCalledWith('http://10.0.0.1/internal')
      })
    })

    it('registers will-navigate handler that blocks private IP navigations', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      // A will-navigate handler should have been registered
      const navigateHandler = webContentsListeners.get('will-navigate')
      expect(navigateHandler).toBeDefined()

      // Simulate a navigation to a private IP
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '192.168.1.1' }] as never)
      const event = { preventDefault: vi.fn() }
      navigateHandler!(event, 'http://192.168.1.1/admin')

      expect(event.preventDefault).toHaveBeenCalled()
      await vi.waitFor(() => {
        expect(mockLoadURL).not.toHaveBeenCalledWith('http://192.168.1.1/admin')
      })
    })

    it('will-navigate handler allows public URLs', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      const navigateHandler = webContentsListeners.get('will-navigate')
      expect(navigateHandler).toBeDefined()

      // Simulate navigation to a valid public URL
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)
      const event = { preventDefault: vi.fn() }
      navigateHandler!(event, 'https://safe.example.com')

      expect(event.preventDefault).toHaveBeenCalled()
      await vi.waitFor(() => {
        expect(mockLoadURL).toHaveBeenCalledWith('https://safe.example.com')
      })
    })

    it('setWindowOpenHandler blocks private IP URLs in new windows', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      expect(windowOpenHandler).toBeDefined()

      // Set up private IP mock BEFORE calling the handler so the async
      // validateUrlWithDns resolves with a private IP and blocks the load
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.1' }] as never)

      // Handler should deny the window open action synchronously
      const result = windowOpenHandler!({ url: 'http://10.0.0.1/secret' })
      expect(result).toEqual({ action: 'deny' })

      // Wait for the async DNS validation to complete
      await vi.waitFor(() => {
        expect(vi.mocked(lookup)).toHaveBeenCalledWith('10.0.0.1', expect.anything())
      })

      // loadURL must not be called — DNS resolved to a private IP
      expect(mockLoadURL).not.toHaveBeenCalledWith('http://10.0.0.1/secret')
    })

    it('setWindowOpenHandler allows public URLs to reach loadURL', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      expect(windowOpenHandler).toBeDefined()

      // Set up public IP mock — the URL should be allowed through
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '104.16.0.1' }] as never)

      const result = windowOpenHandler!({ url: 'https://public.example.com/page' })
      expect(result).toEqual({ action: 'deny' })

      // Wait for the async validation to complete and loadURL to be called
      await vi.waitFor(() => {
        expect(mockLoadURL).toHaveBeenCalledWith('https://public.example.com/page')
      })
    })

    it('navigation sequencing: newer navigation supersedes a pending one', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      const navigateHandler = webContentsListeners.get('will-navigate')
      expect(navigateHandler).toBeDefined()

      // Simulate two rapid navigations — the first one should be superseded
      // First navigation: slow DNS (will resolve after the second one)
      let resolveFirst: (value: unknown) => void
      const firstPromise = new Promise(resolve => {
        resolveFirst = resolve
      })
      vi.mocked(lookup).mockImplementationOnce(() => firstPromise as never)

      // Second navigation: fast DNS
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      const event1 = { preventDefault: vi.fn() }
      const event2 = { preventDefault: vi.fn() }

      navigateHandler!(event1, 'https://slow.example.com')
      navigateHandler!(event2, 'https://fast.example.com')

      // Wait for the second (fast) navigation to complete
      await vi.waitFor(() => {
        expect(mockLoadURL).toHaveBeenCalledWith('https://fast.example.com')
      })

      // Now resolve the first (slow) navigation — it should be ignored
      resolveFirst!([{ address: '93.184.216.34' }])
      // Allow microtask queue to flush so the .then() of the first promise runs
      await new Promise(resolve => setTimeout(resolve, 50))

      // The slow URL should NOT have been loaded (superseded by the fast one)
      expect(mockLoadURL).not.toHaveBeenCalledWith('https://slow.example.com')
    })

    it('will-navigate validates same-origin navigations with DNS check', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      const navigateHandler = webContentsListeners.get('will-navigate')
      expect(navigateHandler).toBeDefined()

      // Same-origin navigation should still be validated (DNS rebinding protection)
      const event = { preventDefault: vi.fn() }
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)
      navigateHandler!(event, 'https://example.com/other-page')

      // preventDefault IS called — navigation goes through guardedNavigate
      expect(event.preventDefault).toHaveBeenCalled()

      // After async DNS validation passes, loadURL is called
      await vi.waitFor(() => {
        expect(mockLoadURL).toHaveBeenCalledWith('https://example.com/other-page')
      })
    })

    it('handles ERR_ABORTED from initial loadURL (redirect interception)', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      // Simulate loadURL rejecting with ERR_ABORTED (happens when will-redirect
      // calls preventDefault on the initial navigation)
      loadURLResponse = Promise.reject(new Error('net::ERR_ABORTED'))

      const result = await invoke('https://example.com')
      // ERR_ABORTED is expected and swallowed — handler returns success
      expect(result).toEqual({ success: true })
    })

    it('propagates non-ERR_ABORTED loadURL errors', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      loadURLResponse = Promise.reject(new Error('net::ERR_CONNECTION_REFUSED'))

      const result = await invoke('https://example.com')
      expect(result).toEqual({ success: false, error: 'net::ERR_CONNECTION_REFUSED' })
    })

    it('guardedNavigate does not loadURL when window is destroyed', async () => {
      const { lookup } = await import('node:dns/promises')
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      await invoke('https://example.com')

      const navigateHandler = webContentsListeners.get('will-navigate')
      expect(navigateHandler).toBeDefined()

      // Reset loadURL call count after initial load
      mockLoadURL.mockClear()

      // Mark window as destroyed — guardedNavigate should skip loadURL
      mockIsDestroyed.mockReturnValue(true)

      // Set up a valid public DNS response
      vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34' }] as never)

      const event = { preventDefault: vi.fn() }
      navigateHandler!(event, 'https://destroyed.example.com')

      // Wait for async validation to complete
      await vi.waitFor(() => {
        expect(vi.mocked(lookup)).toHaveBeenCalledWith('destroyed.example.com', expect.anything())
      })

      // Allow microtask to flush
      await new Promise(resolve => setTimeout(resolve, 50))

      // loadURL must NOT be called — window is destroyed
      expect(mockLoadURL).not.toHaveBeenCalled()
    })
  })

  describe('system:get-fonts', () => {
    const invoke = () => handlers.get('system:get-fonts')!({})

    it('returns fonts from platform command', async () => {
      const { execAsync } = await import('../utils')
      vi.mocked(execAsync).mockResolvedValueOnce({
        stdout: 'Arial\nHelvetica\nCourier New\n',
        stderr: '',
      } as never)

      const result = await invoke()
      expect(result).toEqual(['Arial', 'Courier New', 'Helvetica'])
    })

    it('returns fallback fonts when platform command fails', async () => {
      const { execAsync } = await import('../utils')
      vi.mocked(execAsync).mockRejectedValueOnce(new Error('Command not found'))

      const result = await invoke()
      expect(result).toContain('Arial')
      expect(result).toContain('Segoe UI')
      expect(result.length).toBeGreaterThan(5)
    })

    it('filters empty lines and sorts results', async () => {
      const { execAsync } = await import('../utils')
      vi.mocked(execAsync).mockResolvedValueOnce({
        stdout: 'Zebra Font\n\n  \nAlpha Font\nMiddle Font\n',
        stderr: '',
      } as never)

      const result = await invoke()
      expect(result).toEqual(['Alpha Font', 'Middle Font', 'Zebra Font'])
    })
  })

  describe('shell:fetch-page-title', () => {
    const invoke = (url: string) => handlers.get('shell:fetch-page-title')!({}, url)

    it('returns error for invalid URL', async () => {
      const { validateUrl } = await import('../../src/utils/networkSecurity')
      vi.mocked(validateUrl).mockImplementation(() => {
        throw new Error('Invalid URL')
      })
      const result = await invoke('not-a-url')
      expect(result).toEqual({ success: false, error: 'Invalid URL' })
    })

    it('rejects URLs that resolve to private IPs (SSRF protection)', async () => {
      const { validateUrl } = await import('../../src/utils/networkSecurity')
      const { lookup } = await import('node:dns/promises')
      const { net } = await import('electron')

      // Reset mocks to exercise the real handler logic
      vi.mocked(validateUrl).mockImplementation((url: string) => new URL(url))
      // DNS resolves to a private IP address
      vi.mocked(lookup).mockResolvedValue([{ address: '192.168.1.100' }] as never)

      const result = await invoke('https://internal-service.local/admin')

      // The handler should reject this because 192.168.x.x is a private IP
      expect(result).toEqual({ success: false, error: 'Internal URLs not allowed' })
      // net.fetch should NOT have been called — blocked before fetch
      expect(net.fetch).not.toHaveBeenCalled()
    })

    it('rejects URLs that redirect to private IPs (redirect revalidation)', async () => {
      const { validateUrl } = await import('../../src/utils/networkSecurity')
      const { lookup } = await import('node:dns/promises')
      const { net } = await import('electron')

      vi.mocked(validateUrl).mockImplementation((url: string) => new URL(url))

      // First DNS lookup returns public IP, redirect target returns private IP
      vi.mocked(lookup)
        .mockResolvedValueOnce([{ address: '93.184.216.34' }] as never) // public
        .mockResolvedValueOnce([{ address: '10.0.0.1' }] as never) // private (redirect target)

      // First fetch returns a redirect to an internal URL
      vi.mocked(net.fetch).mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: new Headers({ location: 'http://10.0.0.1/secret' }),
      } as unknown as Response)

      const result = await invoke('https://evil.com/redirect')

      // Should be blocked when the redirect target resolves to a private IP
      expect(result).toEqual({ success: false, error: 'Internal URLs not allowed' })
    })
  })
})
