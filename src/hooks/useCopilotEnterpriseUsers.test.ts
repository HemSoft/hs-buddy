import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type {
  CopilotEnterpriseUsersResponse,
  CopilotEnterpriseUsersSnapshot,
} from '../types/copilotEnterpriseUsers'

const mockGetCopilotEnterpriseUsers = vi.fn<() => Promise<CopilotEnterpriseUsersResponse>>()
type EnterpriseUsersGithub = typeof window.github & {
  getCopilotEnterpriseUsers?: () => Promise<CopilotEnterpriseUsersResponse>
}

Object.defineProperty(window, 'github', {
  value: { getCopilotEnterpriseUsers: mockGetCopilotEnterpriseUsers },
  writable: true,
  configurable: true,
})

import { useCopilotEnterpriseUsers } from './useCopilotEnterpriseUsers'

const snapshot: CopilotEnterpriseUsersSnapshot = {
  generatedAt: '2026-06-02T02:30:20.000Z',
  fileLastWriteTime: '2026-06-02T02:30:20.000Z',
  sourceFile: 'D:\\github\\HemSoft\\codexbar\\data\\copilot-metrics.json',
  enterprise: 'bertelsmann',
  organization: 'Relias-Engineering',
  year: 2026,
  month: 6,
  days: [1, 2],
  totalUsers: 1,
  activeUsers: 1,
  users: [
    {
      login: 'fhemmerrelias',
      grossQuantity: 11540.58,
      grossAmount: 115.41,
      netAmount: 0,
      modelCount: 2,
      topModel: 'Claude Opus 4.8',
      topModelQuantity: 7000,
      success: true,
      errorMessage: null,
      sourceJson: '{ "User": "fhemmerrelias", "Success": true }',
    },
  ],
}

describe('useCopilotEnterpriseUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const github = window.github as EnterpriseUsersGithub
    github.getCopilotEnterpriseUsers = mockGetCopilotEnterpriseUsers
    mockGetCopilotEnterpriseUsers.mockResolvedValue({ success: true, data: snapshot })
  })

  it('loads enterprise users on mount', async () => {
    const { result } = renderHook(() => useCopilotEnterpriseUsers())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockGetCopilotEnterpriseUsers).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(snapshot)
    expect(result.current.error).toBeNull()
  })

  it('reloads when refresh token changes', async () => {
    const { result, rerender } = renderHook(
      ({ refreshToken }) => useCopilotEnterpriseUsers(refreshToken),
      { initialProps: { refreshToken: 1 } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ refreshToken: 2 })
    await waitFor(() => expect(mockGetCopilotEnterpriseUsers).toHaveBeenCalledTimes(2))

    expect(result.current.data).toEqual(snapshot)
  })

  it('reports API failures', async () => {
    mockGetCopilotEnterpriseUsers.mockResolvedValue({ success: false, error: 'No file' })

    const { result } = renderHook(() => useCopilotEnterpriseUsers())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('No file')
  })

  it('reports unavailable preload API', async () => {
    window.github = {} as typeof window.github

    const { result } = renderHook(() => useCopilotEnterpriseUsers())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Copilot Enterprise users source is unavailable.')
  })

  it('reports thrown loader errors', async () => {
    mockGetCopilotEnterpriseUsers.mockRejectedValue(new Error('Disk unavailable'))

    const { result } = renderHook(() => useCopilotEnterpriseUsers())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Disk unavailable')
  })
})
