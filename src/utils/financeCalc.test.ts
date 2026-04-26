import { describe, expect, it } from 'vitest'
import {
  normalizeSymbol,
  isValidSymbol,
  buildYahooFinanceUrl,
  extractPriceData,
  calculateMarketOpen,
  buildQuoteFromMeta,
  parseChartResponse,
  SYMBOL_NAMES,
  type ChartMeta,
  type ChartResponse,
} from './financeCalc'

// --- normalizeSymbol ---

describe('normalizeSymbol', () => {
  it('uppercases and trims the symbol', () => {
    expect(normalizeSymbol('  aapl  ')).toBe('AAPL')
  })

  it('handles empty string', () => {
    expect(normalizeSymbol('')).toBe('')
  })

  it('handles already-uppercase symbol', () => {
    expect(normalizeSymbol('MSFT')).toBe('MSFT')
  })

  it('handles null/undefined input gracefully', () => {
    expect(normalizeSymbol(null as unknown as string)).toBe('')
    expect(normalizeSymbol(undefined as unknown as string)).toBe('')
  })
})

// --- isValidSymbol ---

describe('isValidSymbol', () => {
  it('accepts standard ticker symbols', () => {
    expect(isValidSymbol('AAPL')).toBe(true)
    expect(isValidSymbol('^GSPC')).toBe(true)
    expect(isValidSymbol('BTC-USD')).toBe(true)
    expect(isValidSymbol('GC=F')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidSymbol('')).toBe(false)
  })

  it('rejects symbols with lowercase', () => {
    expect(isValidSymbol('aapl')).toBe(false)
  })

  it('rejects symbols longer than 20 characters', () => {
    expect(isValidSymbol('A'.repeat(21))).toBe(false)
  })

  it('rejects symbols with spaces', () => {
    expect(isValidSymbol('AA PL')).toBe(false)
  })
})

// --- buildYahooFinanceUrl ---

describe('buildYahooFinanceUrl', () => {
  it('builds the correct URL for a simple symbol', () => {
    expect(buildYahooFinanceUrl('AAPL')).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d'
    )
  })

  it('encodes special characters in the symbol', () => {
    const url = buildYahooFinanceUrl('^GSPC')
    expect(url).toContain('%5EGSPC')
  })
})

// --- extractPriceData ---

describe('extractPriceData', () => {
  it('extracts price and previousClose', () => {
    const result = extractPriceData({
      regularMarketPrice: 150.25,
      previousClose: 148.5,
    })
    expect(result).toEqual({ price: 150.25, prevClose: 148.5 })
  })

  it('uses chartPreviousClose when previousClose is missing', () => {
    const result = extractPriceData({
      regularMarketPrice: 150.25,
      chartPreviousClose: 147.0,
    })
    expect(result).toEqual({ price: 150.25, prevClose: 147.0 })
  })

  it('prefers previousClose over chartPreviousClose', () => {
    const result = extractPriceData({
      regularMarketPrice: 150.25,
      previousClose: 148.5,
      chartPreviousClose: 147.0,
    })
    expect(result).toEqual({ price: 150.25, prevClose: 148.5 })
  })

  it('returns null when regularMarketPrice is missing', () => {
    const result = extractPriceData({
      regularMarketPrice: undefined as unknown as number,
      previousClose: 148.5,
    })
    expect(result).toBeNull()
  })

  it('returns null when both closes are missing', () => {
    const result = extractPriceData({ regularMarketPrice: 150.25 })
    expect(result).toBeNull()
  })
})

// --- calculateMarketOpen ---

describe('calculateMarketOpen', () => {
  it('returns true when no trading period is set', () => {
    expect(calculateMarketOpen({})).toBe(true)
  })

  it('returns true when trading period has invalid types', () => {
    expect(
      calculateMarketOpen({
        currentTradingPeriod: {
          regular: { start: 'bad' as unknown as number, end: 0 },
        },
      })
    ).toBe(true)
  })

  it('returns true during trading hours', () => {
    const start = 1000
    const end = 2000
    const meta = { currentTradingPeriod: { regular: { start, end } } }
    expect(calculateMarketOpen(meta, 1500)).toBe(true)
  })

  it('returns true at market open', () => {
    const meta = { currentTradingPeriod: { regular: { start: 1000, end: 2000 } } }
    expect(calculateMarketOpen(meta, 1000)).toBe(true)
  })

  it('returns false at market close', () => {
    const meta = { currentTradingPeriod: { regular: { start: 1000, end: 2000 } } }
    expect(calculateMarketOpen(meta, 2000)).toBe(false)
  })

  it('returns false before market open', () => {
    const meta = { currentTradingPeriod: { regular: { start: 1000, end: 2000 } } }
    expect(calculateMarketOpen(meta, 999)).toBe(false)
  })

  it('uses Date.now when no nowEpochSec provided', () => {
    const now = Math.floor(Date.now() / 1000)
    const meta = { currentTradingPeriod: { regular: { start: now - 100, end: now + 100 } } }
    expect(calculateMarketOpen(meta)).toBe(true)
  })
})

// --- buildQuoteFromMeta ---

describe('buildQuoteFromMeta', () => {
  const baseMeta: ChartMeta = {
    symbol: 'AAPL',
    regularMarketPrice: 150,
    previousClose: 145,
    shortName: 'Apple Inc.',
  }

  it('builds a successful quote', () => {
    const result = buildQuoteFromMeta(baseMeta, 'AAPL')
    expect(result.success).toBe(true)
    expect(result.quote!.symbol).toBe('AAPL')
    expect(result.quote!.name).toBe('Apple Inc.')
    expect(result.quote!.price).toBe(150)
    expect(result.quote!.previousClose).toBe(145)
    expect(result.quote!.change).toBeCloseTo(5, 10)
    expect(result.quote!.changePercent).toBeCloseTo((5 / 145) * 100, 5)
  })

  it('returns error when price data is incomplete', () => {
    const meta: ChartMeta = {
      symbol: 'BAD',
      regularMarketPrice: undefined as unknown as number,
    }
    const result = buildQuoteFromMeta(meta, 'BAD')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Incomplete data')
  })

  it('uses SYMBOL_NAMES for known symbols', () => {
    const meta: ChartMeta = {
      symbol: '^GSPC',
      regularMarketPrice: 5000,
      previousClose: 4990,
    }
    const result = buildQuoteFromMeta(meta, '^GSPC')
    expect(result.quote!.name).toBe('S&P 500')
  })

  it('falls back to shortName when not in SYMBOL_NAMES', () => {
    const meta: ChartMeta = {
      symbol: 'UNKNOWN',
      regularMarketPrice: 100,
      previousClose: 99,
      shortName: 'Unknown Corp',
    }
    const result = buildQuoteFromMeta(meta, 'UNKNOWN')
    expect(result.quote!.name).toBe('Unknown Corp')
  })

  it('falls back to symbol when no shortName', () => {
    const meta: ChartMeta = {
      symbol: 'XYZ',
      regularMarketPrice: 100,
      previousClose: 99,
    }
    const result = buildQuoteFromMeta(meta, 'XYZ')
    expect(result.quote!.name).toBe('XYZ')
  })

  it('handles zero previousClose without division error', () => {
    const meta: ChartMeta = {
      symbol: 'ZER',
      regularMarketPrice: 10,
      previousClose: 0,
    }
    const result = buildQuoteFromMeta(meta, 'ZER')
    expect(result.success).toBe(true)
    expect(result.quote!.changePercent).toBe(0)
  })
})

// --- parseChartResponse ---

describe('parseChartResponse', () => {
  it('returns error from chart.error', () => {
    const json: ChartResponse = {
      chart: { error: { description: 'Rate limit exceeded' } },
    }
    const result = parseChartResponse(json, 'AAPL')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Rate limit exceeded')
  })

  it('returns error when no result data', () => {
    const json: ChartResponse = { chart: { result: [] } }
    const result = parseChartResponse(json, 'AAPL')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No data')
  })

  it('returns error when result is undefined', () => {
    const json: ChartResponse = { chart: {} }
    const result = parseChartResponse(json, 'AAPL')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No data')
  })

  it('parses a valid chart response', () => {
    const json: ChartResponse = {
      chart: {
        result: [
          {
            meta: {
              symbol: 'AAPL',
              regularMarketPrice: 150,
              previousClose: 145,
              shortName: 'Apple Inc.',
            },
          },
        ],
      },
    }
    const result = parseChartResponse(json, 'AAPL')
    expect(result.success).toBe(true)
    expect(result.quote!.symbol).toBe('AAPL')
  })
})

// --- SYMBOL_NAMES ---

describe('SYMBOL_NAMES', () => {
  it('contains expected market indices', () => {
    expect(SYMBOL_NAMES['^GSPC']).toBe('S&P 500')
    expect(SYMBOL_NAMES['^IXIC']).toBe('NASDAQ')
    expect(SYMBOL_NAMES['BTC-USD']).toBe('Bitcoin')
  })
})
