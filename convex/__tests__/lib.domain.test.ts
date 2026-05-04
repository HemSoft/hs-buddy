import { describe, test, expect } from 'vitest'
import { SINGLETON_KEY, isPendingOrRunning, notFoundError } from '../lib/domain'

describe('lib/domain', () => {
  describe('SINGLETON_KEY', () => {
    test('equals "default"', () => {
      expect(SINGLETON_KEY).toBe('default')
    })
  })

  describe('isPendingOrRunning', () => {
    test('returns true for "pending"', () => {
      expect(isPendingOrRunning('pending')).toBe(true)
    })

    test('returns true for "running"', () => {
      expect(isPendingOrRunning('running')).toBe(true)
    })

    test('returns false for "completed"', () => {
      expect(isPendingOrRunning('completed')).toBe(false)
    })

    test('returns false for "failed"', () => {
      expect(isPendingOrRunning('failed')).toBe(false)
    })

    test('returns false for "cancelled"', () => {
      expect(isPendingOrRunning('cancelled')).toBe(false)
    })

    test('returns false for arbitrary strings', () => {
      expect(isPendingOrRunning('unknown')).toBe(false)
      expect(isPendingOrRunning('')).toBe(false)
    })
  })

  describe('notFoundError', () => {
    test('returns an Error with formatted message', () => {
      const err = notFoundError('Bookmark', 'abc123')
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Bookmark abc123 not found')
    })

    test('message includes table name and id', () => {
      const err = notFoundError('Job', 'job-id-999')
      expect(err.message).toContain('Job')
      expect(err.message).toContain('job-id-999')
    })
  })
})
