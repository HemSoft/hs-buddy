import { bench, describe } from 'vitest'
import { calculateNextRunAt } from './cronUtils'

const FIXED_FROM = new Date('2026-03-30T14:00:00Z')

describe('calculateNextRunAt', () => {
  bench('every minute (* * * * *)', () => {
    calculateNextRunAt('* * * * *', 'America/New_York', FIXED_FROM)
  })

  bench('every 5 minutes (*/5 * * * *)', () => {
    calculateNextRunAt('*/5 * * * *', 'America/New_York', FIXED_FROM)
  })

  bench('daily at midnight (0 0 * * *)', () => {
    calculateNextRunAt('0 0 * * *', 'America/New_York', FIXED_FROM)
  })

  bench('weekdays at 9am (0 9 * * 1-5)', () => {
    calculateNextRunAt('0 9 * * 1-5', 'America/New_York', FIXED_FROM)
  })

  bench('complex (15,45 8-17 * * 1-5)', () => {
    calculateNextRunAt('15,45 8-17 * * 1-5', 'America/New_York', FIXED_FROM)
  })

  bench('no timezone (UTC default)', () => {
    calculateNextRunAt('0 12 * * *', undefined, FIXED_FROM)
  })
})
