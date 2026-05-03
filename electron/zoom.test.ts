import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}))

vi.mock('./jsonFileStore', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}))

import { loadZoomLevel, saveZoomLevel } from './zoom'
import { readJsonFile, writeJsonFile } from './jsonFileStore'

describe('zoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadZoomLevel', () => {
    it('returns stored zoomFactor from file', () => {
      vi.mocked(readJsonFile).mockReturnValue({ zoomFactor: 1.5 })
      expect(loadZoomLevel()).toBe(1.5)
    })

    it('returns 1.0 when zoomFactor is not set', () => {
      vi.mocked(readJsonFile).mockReturnValue({})
      expect(loadZoomLevel()).toBe(1.0)
    })

    it('returns 1.0 when zoomFactor is 0 (falsy)', () => {
      vi.mocked(readJsonFile).mockReturnValue({ zoomFactor: 0 })
      expect(loadZoomLevel()).toBe(1.0)
    })

    it('returns 1.0 when readJsonFile throws', () => {
      vi.mocked(readJsonFile).mockImplementation(() => {
        throw new Error('read error')
      })
      expect(loadZoomLevel()).toBe(1.0)
    })
  })

  describe('saveZoomLevel', () => {
    it('writes zoomFactor to the file', () => {
      saveZoomLevel(2.0)
      expect(writeJsonFile).toHaveBeenCalledWith(expect.stringContaining('zoom-level.json'), {
        zoomFactor: 2.0,
      })
    })

    it('does not throw when writeJsonFile fails', () => {
      vi.mocked(writeJsonFile).mockImplementation(() => {
        throw new Error('write error')
      })
      expect(() => saveZoomLevel(1.5)).not.toThrow()
    })
  })
})
