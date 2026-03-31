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
})
