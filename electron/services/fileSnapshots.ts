import { open, type FileHandle } from 'node:fs/promises'
import type { Stats } from 'node:fs'

export class FileTooLargeError extends Error {
  constructor(readonly size: number) {
    super('File exceeds the read limit')
  }
}

async function readBounded(
  file: FileHandle,
  maxBytes: number,
  initialSize: number
): Promise<Buffer> {
  let buffer = Buffer.alloc(Math.min(initialSize + 1, maxBytes + 1))
  let length = 0
  while (length <= maxBytes) {
    if (length === buffer.length) {
      const grown = Buffer.alloc(Math.min(buffer.length * 2, maxBytes + 1))
      buffer.copy(grown)
      buffer = grown
    }
    const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
    if (bytesRead === 0) return buffer.subarray(0, length)
    length += bytesRead
  }
  throw new FileTooLargeError(length)
}

/** Validate and read the same opened file, even if its pathname is replaced. */
export async function readFileSnapshot(
  filePath: string,
  maxBytes?: number
): Promise<{ data: Buffer; stats: Stats }> {
  const file = await open(filePath, 'r')
  try {
    const stats = await file.stat()
    if (!stats.isFile()) throw new Error('Not a regular file')
    if (maxBytes !== undefined && stats.size > maxBytes) throw new FileTooLargeError(stats.size)
    const data =
      maxBytes === undefined ? await file.readFile() : await readBounded(file, maxBytes, stats.size)
    return { data, stats }
  } finally {
    await file.close()
  }
}
