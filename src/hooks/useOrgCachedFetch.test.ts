import { describe, it, expect, vi } from 'vitest'
import {
  applyResolvedOrgCache,
  isStaleOrgFetch,
  applyOrgFetchResult,
  handleOrgFetchErrorIfCurrent,
} from './useOrgCachedFetch'

vi.mock('../services/dataCache', () => ({
  dataCache: { set: vi.fn() },
}))

vi.mock('../api/github', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../services/taskQueue', () => ({
  getTaskQueue: vi.fn(),
}))

describe('applyResolvedOrgCache', () => {
  it('returns false and does not call setters when cached is null', () => {
    const setData = vi.fn()
    const setError = vi.fn()
    const setPhase = vi.fn()
    expect(applyResolvedOrgCache(null, setData, setError, setPhase)).toBe(false)
    expect(setData).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
    expect(setPhase).not.toHaveBeenCalled()
  })

  it('returns true and applies cached data when not null', () => {
    const setData = vi.fn()
    const setError = vi.fn()
    const setPhase = vi.fn()
    const data = { repos: ['repo1'] }
    expect(applyResolvedOrgCache(data, setData, setError, setPhase)).toBe(true)
    expect(setData).toHaveBeenCalledWith(data)
    expect(setError).toHaveBeenCalledWith(null)
    expect(setPhase).toHaveBeenCalledWith('ready')
  })
})

describe('isStaleOrgFetch', () => {
  it('returns true when keys differ', () => {
    expect(isStaleOrgFetch('key-a', { current: 'key-b' })).toBe(true)
  })

  it('returns false when keys match', () => {
    expect(isStaleOrgFetch('key-a', { current: 'key-a' })).toBe(false)
  })
})

describe('applyOrgFetchResult', () => {
  it('does nothing when fetch is stale', () => {
    const setData = vi.fn()
    const setPhase = vi.fn()
    const normalize = vi.fn()
    applyOrgFetchResult('key-a', { current: 'key-b' }, normalize, 'result', setData, setPhase)
    expect(normalize).not.toHaveBeenCalled()
    expect(setData).not.toHaveBeenCalled()
  })

  it('normalizes and applies when fetch is current', () => {
    const setData = vi.fn()
    const setPhase = vi.fn()
    const normalize = vi.fn(d => d)
    applyOrgFetchResult('key-a', { current: 'key-a' }, normalize, 'result', setData, setPhase)
    expect(normalize).toHaveBeenCalledWith('result')
    // startTransition calls the callback synchronously in test env
    expect(setData).toHaveBeenCalledWith('result')
    expect(setPhase).toHaveBeenCalledWith('ready')
  })
})

describe('handleOrgFetchErrorIfCurrent', () => {
  it('does nothing when fetch is stale', () => {
    const setPhase = vi.fn()
    const setError = vi.fn()
    handleOrgFetchErrorIfCurrent(
      new Error('fail'),
      'key-a',
      { current: 'key-b' },
      setPhase,
      setError
    )
    expect(setPhase).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })

  it('sets error phase when fetch is current', () => {
    const setPhase = vi.fn()
    const setError = vi.fn()
    handleOrgFetchErrorIfCurrent(
      new Error('fail'),
      'key-a',
      { current: 'key-a' },
      setPhase,
      setError
    )
    expect(setPhase).toHaveBeenCalledWith('error')
    expect(setError).toHaveBeenCalledWith('fail')
  })
})
