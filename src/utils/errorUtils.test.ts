import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './errorUtils'

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
