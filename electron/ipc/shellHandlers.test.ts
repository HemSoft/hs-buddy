import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    }
    setMenuBarVisibility = vi.fn()
    loadURL = vi.fn().mockResolvedValue(undefined)
    setTitle = vi.fn()
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

    it('returns error when shell.openExternal fails', async () => {
      vi.mocked(shell.openExternal).mockRejectedValue(new Error('Permission denied'))
      const result = await invoke('https://example.com')
      expect(result).toEqual({ success: false, error: 'Permission denied' })
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
