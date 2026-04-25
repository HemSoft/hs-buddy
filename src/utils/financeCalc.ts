export const SYMBOL_NAMES: Record<string, string> = {
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
    marketOpen: boolean
  }
  error?: string
}

export interface ChartMeta {
  symbol: string
  regularMarketPrice: number
  previousClose?: number
  chartPreviousClose?: number
  shortName?: string
  currentTradingPeriod?: { regular: { start: number; end: number } }
}

export interface ChartResponse {
  chart: {
    result?: Array<{ meta: ChartMeta }>
    error?: { description: string }
  }
}

export function extractPriceData(meta: {
  regularMarketPrice: number
  previousClose?: number
  chartPreviousClose?: number
}): { price: number; prevClose: number } | null {
  if (typeof meta.regularMarketPrice !== 'number') return null
  const prevClose = [meta.previousClose, meta.chartPreviousClose].find(
    (v): v is number => typeof v === 'number'
  )
  if (prevClose === undefined) return null
  return { price: meta.regularMarketPrice, prevClose }
}

/** Determine whether the market is currently open.
 *  Accepts an optional `nowEpochSec` for deterministic testing. */
export function calculateMarketOpen(
  meta: { currentTradingPeriod?: { regular: { start: number; end: number } } },
  nowEpochSec?: number
): boolean {
  const tp = meta.currentTradingPeriod?.regular
  if (!tp || typeof tp.start !== 'number' || typeof tp.end !== 'number') {
    return true // default open for assets without trading periods (crypto, futures)
  }
  const nowEpoch = nowEpochSec ?? Math.floor(Date.now() / 1000)
  return nowEpoch >= tp.start && nowEpoch < tp.end
}

export function buildQuoteFromMeta(meta: ChartMeta, symbol: string): FinanceQuoteResult {
  const priceData = extractPriceData(meta)
  if (!priceData) {
    return { success: false, error: `Incomplete data for ${symbol}` }
  }

  const { price, prevClose } = priceData
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
      marketOpen: calculateMarketOpen(meta),
    },
  }
}

export function parseChartResponse(json: ChartResponse, symbol: string): FinanceQuoteResult {
  if (json.chart.error) {
    return { success: false, error: json.chart.error.description }
  }
  const meta = json.chart.result?.[0]?.meta
  if (!meta) {
    return { success: false, error: `No data for ${symbol}` }
  }
  return buildQuoteFromMeta(meta, symbol)
}
