import { describe, expect, it } from 'vitest'
import {
  getErrorMessage,
  getUserFacingErrorMessage,
  isAbortError,
  throwIfAborted,
} from './errorUtils'

describe('getErrorMessage', () => {
  it('returns the message from an Error instance', () => {
    const error = new Error('something went wrong')

    expect(getErrorMessage(error)).toBe('something went wrong')
  })

  it('returns the message from an Error subclass', () => {
    const error = new TypeError('invalid type')

    expect(getErrorMessage(error)).toBe('invalid type')
  })

  it('returns the string directly when given a string', () => {
    expect(getErrorMessage('plain string error')).toBe('plain string error')
  })

  it('returns a string representation of a number', () => {
    expect(getErrorMessage(42)).toBe('42')
  })

  it('returns "null" for null', () => {
    expect(getErrorMessage(null)).toBe('null')
  })

  it('returns "undefined" for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined')
  })

  it('returns string representation of an object', () => {
    expect(getErrorMessage({ key: 'value' })).toBe('[object Object]')
  })
})

describe('getUserFacingErrorMessage', () => {
  it('returns the error message for a real Error', () => {
    expect(getUserFacingErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns fallback for null', () => {
    expect(getUserFacingErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('returns fallback for undefined', () => {
    expect(getUserFacingErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('returns fallback for a plain object', () => {
    expect(getUserFacingErrorMessage({ key: 'val' }, 'fallback')).toBe('fallback')
  })

  it('returns fallback for an empty string error', () => {
    expect(getUserFacingErrorMessage('', 'fallback')).toBe('fallback')
  })

  it('returns the string for a meaningful string error', () => {
    expect(getUserFacingErrorMessage('network error', 'fallback')).toBe('network error')
  })
})

describe('throwIfAborted', () => {
  it('throws a DOMException with name AbortError when signal is aborted', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() => throwIfAborted(controller.signal)).toThrow(DOMException)
    expect(() => throwIfAborted(controller.signal)).toThrow('Cancelled')
  })

  it('does nothing when the signal is not aborted', () => {
    const controller = new AbortController()

    expect(() => throwIfAborted(controller.signal)).not.toThrow()
  })
})

describe('isAbortError', () => {
  it('returns true for a DOMException with name AbortError', () => {
    const error = new DOMException('Cancelled', 'AbortError')

    expect(isAbortError(error)).toBe(true)
  })

  it('returns false for a DOMException with a different name', () => {
    const error = new DOMException('something', 'NetworkError')

    expect(isAbortError(error)).toBe(false)
  })

  it('returns false for a regular Error', () => {
    expect(isAbortError(new Error('fail'))).toBe(false)
  })

  it('returns false for a non-error value', () => {
    expect(isAbortError('AbortError')).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
