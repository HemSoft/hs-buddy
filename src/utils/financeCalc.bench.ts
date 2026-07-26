import { bench, describe } from 'vitest'
import {
  buildQuoteFromMeta,
  parseChartResponse,
  type ChartMeta,
  type ChartResponse,
} from './financeCalc'

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

function makeDataset(count: number): ChartMeta[] {
  return Array.from({ length: count }, (_, index) => makeMeta(index))
}

function buildQuotes(dataset: ChartMeta[]): number {
  let changeTotal = 0
  for (const meta of dataset) {
    changeTotal += buildQuoteFromMeta(meta, meta.symbol).quote?.change ?? 0
  }
  return changeTotal
}

function parseResponses(dataset: ChartMeta[]): number {
  let changeTotal = 0
  for (const meta of dataset) {
    const response: ChartResponse = { chart: { result: [{ meta }] } }
    changeTotal += parseChartResponse(response, meta.symbol).quote?.change ?? 0
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
