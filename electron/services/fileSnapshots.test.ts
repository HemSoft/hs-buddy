import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('node:fs/promises', () => ({ open: mocks.open }))

import { FileTooLargeError, readFileSnapshot } from './fileSnapshots'

function descriptor(content: string, reportedSize = Buffer.byteLength(content), chunkSize = 2) {
  const bytes = Buffer.from(content)
  let cursor = 0
  return {
    stat: vi.fn(async () => ({ size: reportedSize, isFile: (): boolean => true, mtimeMs: 123 })),
    readFile: vi.fn(async () => bytes),
    read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
      const chunk = bytes.subarray(cursor, cursor + Math.min(length, chunkSize))
      chunk.copy(buffer, offset)
      cursor += chunk.length
      return { bytesRead: chunk.length, buffer }
    }),
    close: vi.fn(async () => {}),
  }
}

beforeEach(() => vi.resetAllMocks())

it('reads metadata and content from the opened file after its path is replaced', async () => {
  let pathContent = 'original'
  const file = descriptor(pathContent)
  mocks.open.mockImplementation(async () => {
    pathContent = 'replacement with different metadata'
    return file
  })

  const result = await readFileSnapshot('/selected/file')
  expect(pathContent).toBe('replacement with different metadata')
  expect(result.data.toString()).toBe('original')
  expect(result.stats.size).toBe(8)
  expect(result.stats.mtimeMs).toBe(123)
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith('/selected/file', 'r')
  expect(file.stat).toHaveBeenCalledOnce()
  expect(file.readFile).toHaveBeenCalledOnce()
  expect(file.close).toHaveBeenCalledOnce()
})

it('collects partial reads and permits a file exactly at the byte limit', async () => {
  const file = descriptor('café', 5)
  mocks.open.mockResolvedValue(file)
  const result = await readFileSnapshot('/selected/file', 5)
  expect(result.data.toString()).toBe('café')
  expect(file.readFile).not.toHaveBeenCalled()
  expect(file.read).toHaveBeenCalledTimes(4)
  expect(file.close).toHaveBeenCalledOnce()
})

it('rejects an oversized file before allocating a read buffer', async () => {
  const file = descriptor('large', 100)
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file', 4)).rejects.toMatchObject({ size: 100 })
  expect(file.read).not.toHaveBeenCalled()
  expect(file.readFile).not.toHaveBeenCalled()
  expect(file.close).toHaveBeenCalledOnce()
})

it('stops at limit plus one when the same file grows after its size check', async () => {
  const file = descriptor('a much larger file', 1, 100)
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file', 4)).rejects.toBeInstanceOf(FileTooLargeError)
  expect(file.read.mock.calls.map(call => call[2])).toEqual([2, 2, 1])
  expect(file.read).toHaveBeenCalledTimes(3)
  expect(file.readFile).not.toHaveBeenCalled()
  expect(file.close).toHaveBeenCalledOnce()
})

it('supports an empty file with a zero-byte limit', async () => {
  const file = descriptor('')
  mocks.open.mockResolvedValue(file)
  expect((await readFileSnapshot('/selected/file', 0)).data.length).toBe(0)
  expect(file.close).toHaveBeenCalledOnce()
})

it('allocates only the small file size plus one byte despite a large configured limit', async () => {
  const file = descriptor('hi')
  mocks.open.mockResolvedValue(file)
  expect((await readFileSnapshot('/selected/file', 10_000_000)).data.toString()).toBe('hi')
  expect(file.read.mock.calls[0][0].length).toBe(3)
  expect(file.close).toHaveBeenCalledOnce()
})

it('rejects a non-regular file and closes the handle', async () => {
  const file = descriptor('')
  file.stat.mockResolvedValue({ size: 0, isFile: () => false, mtimeMs: 123 })
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file')).rejects.toThrow('Not a regular file')
  expect(file.close).toHaveBeenCalledOnce()
})

it('closes the handle after a metadata error', async () => {
  const file = descriptor('')
  file.stat.mockRejectedValue(new Error('metadata unavailable'))
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file')).rejects.toThrow('metadata unavailable')
  expect(file.close).toHaveBeenCalledOnce()
})

it('closes the handle after an unbounded read error', async () => {
  const file = descriptor('')
  file.readFile.mockRejectedValue(new Error('read failed'))
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file')).rejects.toThrow('read failed')
  expect(file.close).toHaveBeenCalledOnce()
})

it('closes the handle after a bounded read error', async () => {
  const file = descriptor('')
  file.read.mockRejectedValue(new Error('read failed'))
  mocks.open.mockResolvedValue(file)
  await expect(readFileSnapshot('/selected/file', 4)).rejects.toThrow('read failed')
  expect(file.close).toHaveBeenCalledOnce()
})

it('propagates an open error', async () => {
  mocks.open.mockRejectedValue(new Error('ENOENT'))
  await expect(readFileSnapshot('/selected/file')).rejects.toThrow('ENOENT')
})
