import { ipcMain, net } from 'electron'

const SYMBOL_RE = /^[A-Z0-9^.=\-]{1,20}$/

const SYMBOL_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^DJI': 'DOW',
  '^RUT': 'Russell 2000',
  '^VIX': 'VIX',
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
  'GC=F': 'Gold',
  'SI=F': 'Silver',
  'CL=F': 'Crude Oil',
}

export interface FinanceQuoteResult {
  success: boolean
  quote?: {
    symbol: string
    name: string
    price: number
    change: number
    changePercent: number
    previousClose: number
  }
  error?: string
}

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

        const json = (await response.json()) as {
          chart: {
            result?: Array<{
              meta: {
                symbol: string
                regularMarketPrice: number
                previousClose?: number
                chartPreviousClose?: number
                shortName?: string
              }
            }>
            error?: { description: string }
          }
        }

        if (json.chart.error) {
          return { success: false, error: json.chart.error.description }
        }

        const meta = json.chart.result?.[0]?.meta
        if (!meta) {
          return { success: false, error: `No data for ${upper}` }
        }

        const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : undefined
        const prevClose = typeof meta.previousClose === 'number'
          ? meta.previousClose
          : typeof meta.chartPreviousClose === 'number'
            ? meta.chartPreviousClose
            : undefined
        if (price === undefined || prevClose === undefined) {
          return { success: false, error: `Incomplete data for ${upper}` }
        }

        const change = price - prevClose
        const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0

        return {
          success: true,
          quote: {
            symbol: meta.symbol,
            name: SYMBOL_NAMES[meta.symbol] ?? meta.shortName ?? meta.symbol,
            price,
            change,
            changePercent,
            previousClose: prevClose,
          },
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        }
      }
    }
  )
}
