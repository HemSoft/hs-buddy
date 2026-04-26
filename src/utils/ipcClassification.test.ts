import { describe, it, expect } from 'vitest'
import { classifyIpcResult, applyIpcSpanAttributes } from './ipcClassification'

describe('classifyIpcResult', () => {
  it('returns ok for null', () => {
    expect(classifyIpcResult(null)).toEqual({ outcome: 'ok' })
  })

  it('returns ok for undefined', () => {
    expect(classifyIpcResult(undefined)).toEqual({ outcome: 'ok' })
  })

  it('returns ok for primitives', () => {
    expect(classifyIpcResult(42)).toEqual({ outcome: 'ok' })
    expect(classifyIpcResult('hello')).toEqual({ outcome: 'ok' })
    expect(classifyIpcResult(true)).toEqual({ outcome: 'ok' })
  })

  it('returns ok for arrays', () => {
    expect(classifyIpcResult([1, 2, 3])).toEqual({ outcome: 'ok' })
  })

  it('returns ok for { success: true }', () => {
    expect(classifyIpcResult({ success: true })).toEqual({ outcome: 'ok' })
  })

  it('returns ok for objects without success property', () => {
    expect(classifyIpcResult({ data: 'hello' })).toEqual({ outcome: 'ok' })
  })

  it('returns error for { success: false }', () => {
    expect(classifyIpcResult({ success: false })).toEqual({ outcome: 'error' })
  })

  it('returns error with message for { success: false, error: string }', () => {
    expect(classifyIpcResult({ success: false, error: 'boom' })).toEqual({
      outcome: 'error',
      errorMessage: 'boom',
    })
  })

  it('stringifies non-string error values', () => {
    expect(classifyIpcResult({ success: false, error: 123 })).toEqual({
      outcome: 'error',
      errorMessage: '123',
    })
  })

  it('omits errorMessage when error is undefined', () => {
    expect(classifyIpcResult({ success: false, error: undefined })).toEqual({
      outcome: 'error',
    })
  })

  it('returns ok for { success: 0 } (falsy but not false)', () => {
    expect(classifyIpcResult({ success: 0 })).toEqual({ outcome: 'ok' })
  })

  it('ignores inherited success from prototype (prototype pollution guard)', () => {
    const proto = { success: false }
    const obj = Object.create(proto) as Record<string, unknown>
    expect(classifyIpcResult(obj)).toEqual({ outcome: 'ok' })
  })
})

describe('applyIpcSpanAttributes', () => {
  it('sets ok result on span', () => {
    const attrs: Record<string, string> = {}
    const span = {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v
      },
    }
    applyIpcSpanAttributes(span, { outcome: 'ok' })
    expect(attrs).toEqual({ 'ipc.result': 'ok' })
  })

  it('sets error result and message on span', () => {
    const attrs: Record<string, string> = {}
    const span = {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v
      },
    }
    applyIpcSpanAttributes(span, { outcome: 'error', errorMessage: 'fail' })
    expect(attrs).toEqual({
      'ipc.result': 'error',
      'ipc.error_message': 'fail',
    })
  })

  it('omits error_message when not present', () => {
    const attrs: Record<string, string> = {}
    const span = {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v
      },
    }
    applyIpcSpanAttributes(span, { outcome: 'error' })
    expect(attrs).toEqual({ 'ipc.result': 'error' })
  })
})
