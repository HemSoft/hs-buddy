import { ipcMain, net } from 'electron'
import {
  type FinanceQuoteResult,
  type ChartResponse,
  normalizeSymbol,
  isValidSymbol,
  buildYahooFinanceUrl,
  parseChartResponse,
} from '../../src/utils/financeCalc'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'

export function registerFinanceHandlers(): void {
  ipcMain.handle(
    'finance:fetch-quote',
    async (_event, symbol: string): Promise<FinanceQuoteResult> => {
      const upper = normalizeSymbol(symbol)
      if (!upper || !isValidSymbol(upper)) {
        return { success: false, error: `Invalid symbol: ${symbol}` }
      }

      try {
        const url = buildYahooFinanceUrl(upper)
        const response = await net.fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'hs-buddy/1.0' },
        })

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }

        const json = (await response.json()) as ChartResponse
        return parseChartResponse(json, upper)
      } catch (err: unknown) {
        return {
          success: false,
          error: getErrorMessageWithFallback(err, 'Fetch failed'),
        }
      }
    }
  )
}
