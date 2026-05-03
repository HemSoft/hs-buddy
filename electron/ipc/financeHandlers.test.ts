import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('../../src/utils/financeCalc', () => ({
  normalizeSymbol: vi.fn((s: string) => s.toUpperCase()),
  isValidSymbol: vi.fn((s: string) => /^[A-Z]{1,5}$/.test(s)),
  buildYahooFinanceUrl: vi.fn((s: string) => `https://yahoo.finance/${s}`),
  parseChartResponse: vi.fn(),
}))

vi.mock('../../src/utils/errorUtils', () => ({
  getErrorMessageWithFallback: vi.fn((err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback
  ),
}))

import { ipcMain, net } from 'electron'
import { registerFinanceHandlers } from './financeHandlers'
import { parseChartResponse } from '../../src/utils/financeCalc'

describe('financeHandlers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = new Map()
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler)
    })
    registerFinanceHandlers()
  })

  it('registers finance:fetch-quote', () => {
    expect(handlers.has('finance:fetch-quote')).toBe(true)
  })

  describe('finance:fetch-quote', () => {
    const invoke = (symbol: string) => handlers.get('finance:fetch-quote')!({}, symbol)

    it('returns error for invalid symbol', async () => {
      const result = await invoke('!!!invalid')
      expect(result).toEqual({ success: false, error: 'Invalid symbol: !!!invalid' })
    })

    it('returns error for empty symbol', async () => {
      const result = await invoke('')
      expect(result).toEqual({ success: false, error: 'Invalid symbol: ' })
    })

    it('fetches and parses chart data for valid symbol', async () => {
      const mockJson = { chart: { result: [] } }
      vi.mocked(net.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJson),
      } as unknown as Response)
      vi.mocked(parseChartResponse).mockReturnValue({
        success: true,
        quote: {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
          change: 2.5,
          changePercent: 1.7,
          previousClose: 147.5,
          marketOpen: true,
        },
      })

      const result = await invoke('AAPL')
      expect(net.fetch).toHaveBeenCalledWith('https://yahoo.finance/AAPL', expect.any(Object))
      expect(result).toEqual({
        success: true,
        quote: {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 150.0,
          change: 2.5,
          changePercent: 1.7,
          previousClose: 147.5,
          marketOpen: true,
        },
      })
    })

    it('returns error when HTTP response is not ok', async () => {
      vi.mocked(net.fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response)

      const result = await invoke('AAPL')
      expect(result).toEqual({ success: false, error: 'HTTP 404' })
    })

    it('returns error when fetch throws', async () => {
      vi.mocked(net.fetch).mockRejectedValue(new Error('Network error'))

      const result = await invoke('AAPL')
      expect(result).toEqual({ success: false, error: 'Network error' })
    })
  })
})
