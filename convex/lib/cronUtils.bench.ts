import { test, describe } from 'vitest'
import { calculateNextRunAt } from './cronUtils'

const FIXED_FROM = new Date('2026-03-30T14:00:00Z')

describe('calculateNextRunAt', () => {
  test('every minute (* * * * *)', async ({ bench }) => {
    await bench('every minute (* * * * *)', () => {
      calculateNextRunAt('* * * * *', 'America/New_York', FIXED_FROM)
    }).run()
  })

  test('every 5 minutes (*/5 * * * *)', async ({ bench }) => {
    await bench('every 5 minutes (*/5 * * * *)', () => {
      calculateNextRunAt('*/5 * * * *', 'America/New_York', FIXED_FROM)
    }).run()
  })

  test('daily at midnight (0 0 * * *)', async ({ bench }) => {
    await bench('daily at midnight (0 0 * * *)', () => {
      calculateNextRunAt('0 0 * * *', 'America/New_York', FIXED_FROM)
    }).run()
  })

  test('weekdays at 9am (0 9 * * 1-5)', async ({ bench }) => {
    await bench('weekdays at 9am (0 9 * * 1-5)', () => {
      calculateNextRunAt('0 9 * * 1-5', 'America/New_York', FIXED_FROM)
    }).run()
  })

  test('complex (15,45 8-17 * * 1-5)', async ({ bench }) => {
    await bench('complex (15,45 8-17 * * 1-5)', () => {
      calculateNextRunAt('15,45 8-17 * * 1-5', 'America/New_York', FIXED_FROM)
    }).run()
  })

  test('no timezone (UTC default)', async ({ bench }) => {
    await bench('no timezone (UTC default)', () => {
      calculateNextRunAt('0 12 * * *', undefined, FIXED_FROM)
    }).run()
  })
})
