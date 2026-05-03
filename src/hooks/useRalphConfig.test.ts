import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mockGetConfig = vi.fn()

Object.defineProperty(window, 'ralph', {
  value: {
    getConfig: mockGetConfig,
    list: vi.fn(),
    launch: vi.fn(),
    stop: vi.fn(),
    onStatusChange: vi.fn(),
    offStatusChange: vi.fn(),
    listTemplates: vi.fn(),
    selectDirectory: vi.fn(),
    getStatus: vi.fn(),
  },
  writable: true,
  configurable: true,
})

import { useRalphModels, useRalphAgents, useRalphProviders } from './useRalphConfig'

describe('useRalphConfig hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useRalphModels', () => {
    it('loads models config and returns data', async () => {
      const mockModels = { models: {}, aliases: {}, tiers: {}, default: 'gpt-4' }
      mockGetConfig.mockResolvedValue(mockModels)

      const { result } = renderHook(() => useRalphModels())

      expect(result.current.loading).toBe(true)
      expect(result.current.data).toBeNull()

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockModels)
      expect(mockGetConfig).toHaveBeenCalledWith('models')
    })

    it('sets error on fetch failure with Error instance', async () => {
      mockGetConfig.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useRalphModels())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.data).toBeNull()
    })

    it('sets error on fetch failure with non-Error value', async () => {
      mockGetConfig.mockRejectedValue('some string error')

      const { result } = renderHook(() => useRalphModels())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to load config')
    })

    it('refresh() reloads data', async () => {
      const first = { models: {}, aliases: {}, tiers: {}, default: 'a' }
      const second = { models: {}, aliases: {}, tiers: {}, default: 'b' }
      mockGetConfig.mockResolvedValueOnce(first)

      const { result } = renderHook(() => useRalphModels())
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.data).toEqual(first)

      mockGetConfig.mockResolvedValueOnce(second)
      result.current.refresh()
      await waitFor(() => {
        expect(result.current.data).toEqual(second)
      })
      expect(mockGetConfig).toHaveBeenCalledTimes(2)
    })
  })

  describe('useRalphAgents', () => {
    it('loads agents config', async () => {
      const data = { version: '1', defaults: {}, roles: {} }
      mockGetConfig.mockResolvedValue(data)

      const { result } = renderHook(() => useRalphAgents())
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.data).toEqual(data)
      expect(mockGetConfig).toHaveBeenCalledWith('agents')
    })
  })

  describe('useRalphProviders', () => {
    it('loads providers config', async () => {
      const data = { version: '1', providers: {}, default: 'copilot' }
      mockGetConfig.mockResolvedValue(data)

      const { result } = renderHook(() => useRalphProviders())
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.data).toEqual(data)
      expect(mockGetConfig).toHaveBeenCalledWith('providers')
    })
  })
})
