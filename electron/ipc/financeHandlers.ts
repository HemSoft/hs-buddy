import { ipcMain, net } from 'electron'
import {
  type FinanceQuoteResult,
  type ChartResponse,
  parseChartResponse,
} from '../../src/utils/financeCalc'

const SYMBOL_RE = /^[A-Z0-9^.=-]{1,20}$/

export function registerFinanceHandlers(): void {
  ipcMain.handle(
    'finance:fetch-quote',
    async (_event, symbol: string): Promise<FinanceQuoteResult> => {
      const upper = (symbol ?? '').toUpperCase().trim()
      if (!upper || !SYMBOL_RE.test(upper)) {
        return { success: false, error: `Invalid symbol: ${symbol}` }
      }

      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=1d`
        const response = await net.fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'hs-buddy/1.0' },
        })

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }

        const json = (await response.json()) as ChartResponse
        return parseChartResponse(json, upper)
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        }
      }
    }
  )
}
