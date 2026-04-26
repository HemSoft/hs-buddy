/** Valid ticker symbol pattern (1–20 uppercase alphanumeric plus ^.=-). */
const SYMBOL_RE = /^[A-Z0-9^.=-]{1,20}$/

/** Normalize a user-entered symbol to uppercase trimmed form. */
export function normalizeSymbol(symbol: string): string {
  return (symbol ?? '').toUpperCase().trim()
}

/** Returns true when the symbol matches the allowed ticker pattern. */
export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol)
}

/** Build the Yahoo Finance chart URL for the given (already-normalized) symbol. */
export function buildYahooFinanceUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
}

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

function hasValidTradingPeriod(
  tp: { start: number; end: number } | undefined
): tp is { start: number; end: number } {
  return !!tp && typeof tp.start === 'number' && typeof tp.end === 'number'
}

/** Determine whether the market is currently open.
 *  Accepts an optional `nowEpochSec` for deterministic testing. */
export function calculateMarketOpen(
  meta: { currentTradingPeriod?: { regular: { start: number; end: number } } },
  nowEpochSec?: number
): boolean {
  const tp = meta.currentTradingPeriod?.regular
  if (!hasValidTradingPeriod(tp)) return true // default open for assets without trading periods
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
