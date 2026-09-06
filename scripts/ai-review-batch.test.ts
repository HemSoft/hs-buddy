import { expect, it } from 'vitest'
import { reconcileBatch } from './ai-review-batch'

it('caps concurrent PR work at four and attempts every candidate after an individual failure', async () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const attempted: number[] = []
  const failures: number[] = []
  let active = 0
  let maximum = 0
  const failed = await reconcileBatch(
    numbers,
    async number => {
      attempted.push(number)
      maximum = Math.max(maximum, ++active)
      await Promise.resolve()
      active--
      if (number === 3) throw new Error('Single PR failed')
    },
    number => {
      failures.push(number)
    }
  )
  expect(maximum).toBe(4)
  expect(attempted.sort((a, b) => a - b)).toEqual(numbers)
  expect(failures).toEqual([3])
  expect(failed).toBe(true)
})

it('does no work for an empty batch and reports successful batches', async () => {
  const calls: number[] = []
  const reconcile = async (number: number) => {
    calls.push(number)
  }
  const reportError = () => {
    throw new Error('Unexpected failure')
  }
  expect(await reconcileBatch([], reconcile, reportError)).toBe(false)
  expect(calls).toEqual([])
  expect(await reconcileBatch([1], reconcile, reportError)).toBe(false)
  expect(calls).toEqual([1])
})
