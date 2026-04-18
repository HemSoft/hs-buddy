import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const MAX_FILE_SIZE = 1_048_576 // 1 MB

/** Known binary extensions that should not be read as text */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.node', '.wasm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.sqlite', '.db', '.lock',
])

/** Map file extension to a language identifier for display */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.json': 'json', '.md': 'markdown', '.css': 'css', '.scss': 'scss',
    '.html': 'html', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.cs': 'csharp', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.sh': 'shell', '.bash': 'shell', '.ps1': 'powershell', '.psm1': 'powershell',
    '.sql': 'sql', '.graphql': 'graphql', '.gql': 'graphql',
    '.toml': 'toml', '.ini': 'ini', '.env': 'shell',
    '.dockerfile': 'dockerfile', '.tf': 'hcl', '.hcl': 'hcl',
    '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
    '.txt': 'plaintext', '.log': 'plaintext', '.csv': 'plaintext',
  }
  // Handle Dockerfile (no extension)
  const basename = path.basename(filePath).toLowerCase()
  if (basename === 'dockerfile') return 'dockerfile'
  if (basename === 'makefile') return 'makefile'
  if (basename === '.gitignore' || basename === '.gitattributes') return 'gitignore'
  return map[ext] || 'plaintext'
}

export interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size: number
}

export function registerFilesystemHandlers(): void {
  ipcMain.handle(
    'fs:read-dir',
    async (_event, dirPath: string): Promise<{ entries: DirEntry[]; error?: string }> => {
      try {
        const resolved = path.resolve(dirPath)
        const items = await readdir(resolved, { withFileTypes: true })
        const entries: DirEntry[] = []

        for (const item of items) {
          // Skip hidden files/dirs (starting with .)
          if (item.name.startsWith('.')) continue
          // Skip common noise directories
          if (item.isDirectory() && (item.name === 'node_modules' || item.name === '__pycache__' || item.name === '.git')) continue

          try {
            const fullPath = path.join(resolved, item.name)
            const st = await stat(fullPath)
            entries.push({
              name: item.name,
              type: item.isDirectory() ? 'directory' : 'file',
              size: st.size,
            })
          } catch {
            // Skip entries we can't stat (permission errors, etc.)
          }
        }

        // Sort: directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })

        return { entries }
      } catch (err) {
        return { entries: [], error: err instanceof Error ? err.message : 'Failed to read directory' }
      }
    }
  )

  ipcMain.handle(
    'fs:read-file',
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

        const st = await stat(resolved)
        if (st.size > MAX_FILE_SIZE) {
          return {
            content: '',
            language: detectLanguage(resolved),
            size: st.size,
            error: `File too large (${(st.size / 1024 / 1024).toFixed(1)} MB). Max: 1 MB.`,
          }
        }

        const content = await readFile(resolved, 'utf-8')
        return {
          content,
          language: detectLanguage(resolved),
          size: st.size,
        }
      } catch (err) {
        return {
          content: '',
          language: 'plaintext',
          size: 0,
          error: err instanceof Error ? err.message : 'Failed to read file',
        }
      }
    }
  )
}
