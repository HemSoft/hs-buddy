import { ipcMain } from 'electron'
import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { detectLanguage } from '../../src/utils/detectLanguage'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'
import { shouldIncludeDirEntry, compareDirEntries } from '../../src/utils/dirEntryUtils'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import { FileTooLargeError, readFileSnapshot } from '../services/fileSnapshots'

const MAX_FILE_SIZE = 1_048_576 // 1 MB

/** Known binary extensions that should not be read as text */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.bz2',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.node',
  '.wasm',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.sqlite',
  '.db',
  '.lock',
])

interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
}

async function buildDirEntries(resolved: string, items: Dirent[]): Promise<DirEntry[]> {
  const entries = await Promise.all(
    items.map(async item => {
      if (!shouldIncludeDirEntry(item.name, item.isDirectory())) return null

      try {
        const fullPath = path.join(resolved, item.name)
        const st = await stat(fullPath)
        return {
          name: item.name,
          path: fullPath,
          type: item.isDirectory() ? 'directory' : 'file',
          size: st.size,
        }
      } catch (_: unknown) {
        // Skip entries we can't stat (permission errors, etc.)
        return null
      }
    })
  )
  const includedEntries = entries.filter((entry): entry is DirEntry => entry !== null)

  includedEntries.sort(compareDirEntries)

  return includedEntries
}

export function registerFilesystemHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.FILESYSTEM_READ_DIR,
    async (_event, dirPath: string): Promise<{ entries: DirEntry[]; error?: string }> => {
      try {
        const resolved = path.resolve(dirPath)
        const items = await readdir(resolved, { withFileTypes: true })
        const entries = await buildDirEntries(resolved, items)
        return { entries }
      } catch (err: unknown) {
        return {
          entries: [],
          error: getErrorMessageWithFallback(err, 'Failed to read directory'),
        }
      }
    }
  )

  ipcMain.handle(
    IPC_INVOKE.FILESYSTEM_READ_FILE,
    async (
      _event,
      filePath: string
    ): Promise<{ content: string; language: string; size: number; error?: string }> => {
      try {
        const resolved = path.resolve(filePath)
        const ext = path.extname(resolved).toLowerCase()

        if (BINARY_EXTENSIONS.has(ext)) {
          return { content: '', language: 'binary', size: 0, error: 'Binary file — cannot preview' }
        }

        const { data } = await readFileSnapshot(resolved, MAX_FILE_SIZE)
        return {
          content: data.toString('utf8'),
          language: detectLanguage(resolved),
          size: data.length,
        }
      } catch (err: unknown) {
        if (err instanceof FileTooLargeError) {
          return {
            content: '',
            language: detectLanguage(path.resolve(filePath)),
            size: err.size,
            error: `File too large (${(err.size / 1024 / 1024).toFixed(1)} MB). Max: 1 MB.`,
          }
        }
        return {
          content: '',
          language: 'plaintext',
          size: 0,
          error: getErrorMessageWithFallback(err, 'Failed to read file'),
        }
      }
    }
  )
}
