import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCopilotSessions, useCopilotSessionDetail } from './useCopilotSessions'

const mockScan = vi.fn()
const mockGetSession = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'copilotSessions', {
    value: { scan: mockScan, getSession: mockGetSession },
    writable: true,
    configurable: true,
  })
})

describe('useCopilotSessions', () => {
  it('starts with empty sessions', () => {
    const { result } = renderHook(() => useCopilotSessions())
    expect(result.current.sessions).toEqual([])
    expect(result.current.totalCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('loads sessions on scan', async () => {
    mockScan.mockResolvedValue({
      sessions: [{ id: '1', title: 'Session 1', turnCount: 5, createdAt: Date.now() }],
      totalCount: 1,
    })

    const { result } = renderHook(() => useCopilotSessions())

    await act(async () => {
      await result.current.scan()
    })

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.totalCount).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('handles scan error', async () => {
    mockScan.mockRejectedValue(new Error('Scan failed'))

    const { result } = renderHook(() => useCopilotSessions())

    await act(async () => {
      await result.current.scan()
    })

    expect(result.current.error).toBe('Scan failed')
    expect(result.current.isLoading).toBe(false)
  })

  it('handles scan non-Error exception', async () => {
    mockScan.mockRejectedValue('string error')

    const { result } = renderHook(() => useCopilotSessions())

    await act(async () => {
      await result.current.scan()
    })

    expect(result.current.error).toBe('Failed to scan sessions')
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores scan results after unmount', async () => {
    let resolveScn: (v: unknown) => void
    mockScan.mockReturnValue(
      new Promise(r => {
        resolveScn = r
      })
    )

    const { result, unmount } = renderHook(() => useCopilotSessions())

    act(() => {
      result.current.scan()
    })
    unmount()

    // Resolve after unmount
    await act(async () => {
      resolveScn!({
        sessions: [{ id: '1', title: 'Session 1', turnCount: 5, createdAt: Date.now() }],
        totalCount: 1,
      })
    })

    // State should NOT have updated (component unmounted)
    expect(result.current.sessions).toEqual([])
  })

  it('ignores scan error after unmount', async () => {
    let rejectScn: (reason?: unknown) => void
    mockScan.mockReturnValue(
      new Promise((_, r) => {
        rejectScn = r
      })
    )

    const { result, unmount } = renderHook(() => useCopilotSessions())

    act(() => {
      result.current.scan()
    })
    unmount()

    // Reject after unmount
    await act(async () => {
      rejectScn!(new Error('Scan failed'))
    })

    // Error should NOT have been set (component unmounted)
    expect(result.current.error).toBeNull()
  })
})

describe('useCopilotSessionDetail', () => {
  it('starts with null session', () => {
    const { result } = renderHook(() => useCopilotSessionDetail())
    expect(result.current.session).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('loads a session by path', async () => {
    const sessionData = { id: '1', turns: [], metadata: { title: 'Test' } }
    mockGetSession.mockResolvedValue(sessionData)

    const { result } = renderHook(() => useCopilotSessionDetail())

    await act(async () => {
      await result.current.load('/path/to/session.json')
    })

    expect(result.current.session).toEqual(sessionData)
    expect(result.current.isLoading).toBe(false)
  })

  it('handles load error', async () => {
    mockGetSession.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => useCopilotSessionDetail())

    await act(async () => {
      await result.current.load('/path/to/missing.json')
    })

    expect(result.current.error).toBe('Not found')
    expect(result.current.session).toBeNull()
  })

  it('handles load non-Error exception', async () => {
    mockGetSession.mockRejectedValue(42)

    const { result } = renderHook(() => useCopilotSessionDetail())

    await act(async () => {
      await result.current.load('/path/to/session.json')
    })

    expect(result.current.error).toBe('Failed to load session')
    expect(result.current.session).toBeNull()
  })

  it('ignores stale load request', async () => {
    let resolveFirst: (v: unknown) => void
    let resolveSecond: (v: unknown) => void

    mockGetSession.mockImplementation(path => {
      if (path === '/first') {
        return new Promise(r => {
          resolveFirst = r
        })
      }
      return new Promise(r => {
        resolveSecond = r
      })
    })

    const { result } = renderHook(() => useCopilotSessionDetail())

    const firstData = { id: '1', turns: [], metadata: { title: 'First' } }
    const secondData = { id: '2', turns: [], metadata: { title: 'Second' } }

    await act(async () => {
      result.current.load('/first')
      result.current.load('/second')
    })

    // Second request completes first
    await act(async () => {
      resolveSecond!(secondData)
    })
    expect(result.current.session).toEqual(secondData)

    // First request completes later, should be ignored
    await act(async () => {
      resolveFirst!(firstData)
    })
    expect(result.current.session).toEqual(secondData)
  })

  it('ignores stale request error', async () => {
    let rejectFirst: (reason?: unknown) => void
    let resolveSecond: (v: unknown) => void

    mockGetSession.mockImplementation(path => {
      if (path === '/first') {
        return new Promise((_, r) => {
          rejectFirst = r
        })
      }
      return new Promise(r => {
        resolveSecond = r
      })
    })

    const { result } = renderHook(() => useCopilotSessionDetail())

    const secondData = { id: '2', turns: [], metadata: { title: 'Second' } }

    await act(async () => {
      result.current.load('/first')
      result.current.load('/second')
    })

    // Second request completes first
    await act(async () => {
      resolveSecond!(secondData)
    })
    expect(result.current.session).toEqual(secondData)
    expect(result.current.error).toBeNull()

    // First request fails later, error should be ignored
    await act(async () => {
      rejectFirst!(new Error('First failed'))
    })
    expect(result.current.error).toBeNull()
    expect(result.current.session).toEqual(secondData)
  })
})
