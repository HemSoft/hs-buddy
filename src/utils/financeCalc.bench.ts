import { bench, describe } from 'vitest'
import {
  buildQuoteFromMeta,
  parseChartResponse,
  type ChartMeta,
  type ChartResponse,
  type FinanceQuoteResult,
} from './financeCalc'

interface FinanceFixture {
  meta: ChartMeta
  response: ChartResponse
}

function makeMeta(index: number): ChartMeta {
  const previousClose = 100 + (index % 250)
  return {
    symbol: `SYM${index}`,
    shortName: `Benchmark Asset ${index}`,
    regularMarketPrice: previousClose + (index % 11) - 5,
    previousClose,
    currentTradingPeriod: {
      regular: { start: 1_782_432_000, end: 1_782_460_800 },
    },
  }
}

function makeDataset(count: number): FinanceFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const meta = makeMeta(index)
    return { meta, response: { chart: { result: [{ meta }] } } }
  })
}

function requireChange(result: FinanceQuoteResult): number {
  if (!result.success || !result.quote) {
    throw new Error(result.error ?? 'Finance benchmark produced no quote')
  }
  return result.quote.change
}

function buildQuotes(dataset: FinanceFixture[]): number {
  let changeTotal = 0
  for (const { meta } of dataset) {
    changeTotal += requireChange(buildQuoteFromMeta(meta, meta.symbol))
  }
  return changeTotal
}

function parseResponses(dataset: FinanceFixture[]): number {
  let changeTotal = 0
  for (const { meta, response } of dataset) {
    changeTotal += requireChange(parseChartResponse(response, meta.symbol))
  }
  return changeTotal
}

const SMALL_DATASET = makeDataset(10)
const MEDIUM_DATASET = makeDataset(100)
const LARGE_DATASET = makeDataset(1_000)

describe('finance quote calculation', () => {
  bench('buildQuoteFromMeta — 10 quotes', () => {
    buildQuotes(SMALL_DATASET)
  })
  bench('buildQuoteFromMeta — 100 quotes', () => {
    buildQuotes(MEDIUM_DATASET)
  })
  bench('buildQuoteFromMeta — 1000 quotes', () => {
    buildQuotes(LARGE_DATASET)
  })
})

describe('finance response parsing', () => {
  bench('parseChartResponse — 10 quotes', () => {
    parseResponses(SMALL_DATASET)
  })
  bench('parseChartResponse — 100 quotes', () => {
    parseResponses(MEDIUM_DATASET)
  })
  bench('parseChartResponse — 1000 quotes', () => {
    parseResponses(LARGE_DATASET)
  })
})
