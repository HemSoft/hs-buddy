import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  workerSuccess,
  workerFailure,
  workerConfigError,
  resolvePromptDefaults,
} from './workerUtils'

describe('workerSuccess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns success result with output and duration', () => {
    const result = workerSuccess('hello world', 500)
    expect(result).toEqual({
      success: true,
      output: 'hello world',
      exitCode: 0,
      duration: 500,
    })
  })

  it('returns undefined output for empty string', () => {
    const result = workerSuccess('', 500)
    expect(result.output).toBeUndefined()
  })

  it('truncates output exceeding maxOutput', () => {
    const result = workerSuccess('abcdef', 500, 3)
    expect(result.output).toContain('abc')
    expect(result.output).toContain('truncated')
  })
})

describe('workerFailure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(2000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('extracts Error message', () => {
    const result = workerFailure(new Error('boom'), 1000)
    expect(result).toEqual({
      success: false,
      error: 'boom',
      duration: 1000,
    })
  })

  it('stringifies non-Error values', () => {
    const result = workerFailure('oops', 1500)
    expect(result.error).toBe('oops')
    expect(result.duration).toBe(500)
  })

  it('stringifies numeric errors', () => {
    const result = workerFailure(42, 1800)
    expect(result.error).toBe('42')
  })
})

describe('workerConfigError', () => {
  it('returns a zero-duration failure with descriptive message', () => {
    const result = workerConfigError('prompt')
    expect(result).toEqual({
      success: false,
      error: 'No prompt specified in job config',
      duration: 0,
    })
  })

  it('includes the missing field name', () => {
    const result = workerConfigError('skillName')
    expect(result.error).toBe('No skillName specified in job config')
  })
})

describe('resolvePromptDefaults', () => {
  const defaults = { model: 'default-model', timeout: 60000 }

  it('uses defaults when values are undefined', () => {
    expect(resolvePromptDefaults({}, defaults)).toEqual({
      model: 'default-model',
      timeout: 60000,
    })
  })

  it('uses provided model when present', () => {
    expect(resolvePromptDefaults({ model: 'custom' }, defaults)).toEqual({
      model: 'custom',
      timeout: 60000,
    })
  })

  it('uses provided timeout when present', () => {
    expect(resolvePromptDefaults({ timeout: 5000 }, defaults)).toEqual({
      model: 'default-model',
      timeout: 5000,
    })
  })

  it('uses both when both provided', () => {
    expect(resolvePromptDefaults({ model: 'gpt-4', timeout: 999 }, defaults)).toEqual({
      model: 'gpt-4',
      timeout: 999,
    })
  })
})
