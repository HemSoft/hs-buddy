import { test, describe } from 'vitest'
import { nextStartTime } from './tempoUtils'
import type { TempoWorklog } from '../../types/tempo'

function makeWorklogs(count: number): TempoWorklog[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    issueKey: `PROJ-${i + 1}`,
    issueSummary: `Task ${i + 1}`,
    hours: 0.5 + (i % 4) * 0.25,
    date: '2026-03-30',
    startTime: '08:00',
    description: `Worklog entry ${i}`,
    accountKey: 'DEV',
    accountName: 'Development',
  }))
}

const FEW = makeWorklogs(3)
const TYPICAL = makeWorklogs(10)
const HEAVY = makeWorklogs(50)

describe('nextStartTime', () => {
  test('3 worklogs', async ({ bench }) => {
    await bench('3 worklogs', () => {
      nextStartTime(FEW)
    }).run()
  })

  test('10 worklogs (typical day)', async ({ bench }) => {
    await bench('10 worklogs (typical day)', () => {
      nextStartTime(TYPICAL)
    }).run()
  })

  test('50 worklogs (heavy day)', async ({ bench }) => {
    await bench('50 worklogs (heavy day)', () => {
      nextStartTime(HEAVY)
    }).run()
  })
})
