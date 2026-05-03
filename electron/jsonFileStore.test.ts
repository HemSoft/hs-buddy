import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readJsonFile, writeJsonFile, updateJsonFile } from './jsonFileStore'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

describe('jsonFileStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('readJsonFile', () => {
    it('returns fallback when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      const result = readJsonFile('/test/path.json', { default: true })
      expect(result).toEqual({ default: true })
      expect(readFileSync).not.toHaveBeenCalled()
    })

    it('reads and parses JSON when file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('{"key": "value"}')
      const result = readJsonFile('/test/path.json', {})
      expect(result).toEqual({ key: 'value' })
      expect(readFileSync).toHaveBeenCalledWith('/test/path.json', 'utf-8')
    })

    it('throws on invalid JSON (does not catch parse errors)', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('not json')
      expect(() => readJsonFile('/test/path.json', {})).toThrow()
    })
  })

  describe('writeJsonFile', () => {
    it('serializes data to JSON and writes to file', () => {
      writeJsonFile('/test/path.json', { hello: 'world' })
      expect(writeFileSync).toHaveBeenCalledWith('/test/path.json', '{"hello":"world"}')
    })

    it('handles arrays', () => {
      writeJsonFile('/test/path.json', [1, 2, 3])
      expect(writeFileSync).toHaveBeenCalledWith('/test/path.json', '[1,2,3]')
    })

    it('handles null', () => {
      writeJsonFile('/test/path.json', null)
      expect(writeFileSync).toHaveBeenCalledWith('/test/path.json', 'null')
    })
  })

  describe('updateJsonFile', () => {
    it('reads existing file, applies updater, and writes result', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('{"count": 1}')
      updateJsonFile('/test/path.json', { count: 0 }, current => ({
        count: current.count + 1,
      }))
      expect(writeFileSync).toHaveBeenCalledWith('/test/path.json', '{"count":2}')
    })

    it('uses fallback when file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      updateJsonFile('/test/path.json', { count: 0 }, current => ({
        count: current.count + 5,
      }))
      expect(writeFileSync).toHaveBeenCalledWith('/test/path.json', '{"count":5}')
    })
  })
})
