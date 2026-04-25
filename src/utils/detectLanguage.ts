/**
 * Maps a file path to a language identifier for syntax highlighting / display.
 *
 * Extracted from electron/ipc/filesystemHandlers.ts and made browser-safe
 * (no Node `path` dependency).
 */

const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'shell',
  '.dockerfile': 'dockerfile',
  '.tf': 'hcl',
  '.hcl': 'hcl',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.csv': 'plaintext',
}

/** Basename-based overrides for files with no distinguishing extension. */
const BASENAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'gitignore',
  '.gitattributes': 'gitignore',
  '.env': 'shell',
  '.dockerfile': 'dockerfile',
}

/** Extract file extension from a path (browser-safe, no Node `path`). */
function fileExt(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || ''
  const dot = name.lastIndexOf('.')
  // dot > 0 means a real extension (not a dotfile like ".env")
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/** Extract file basename from a path (browser-safe). */
function fileName(filePath: string): string {
  return (filePath.replace(/\\/g, '/').split('/').pop() || '').toLowerCase()
}

/** Map a file path to a language identifier for display. */
export function detectLanguage(filePath: string): string {
  const name = fileName(filePath)
  const byBasename = BASENAME_MAP[name]
  if (byBasename) return byBasename

  const ext = fileExt(filePath)
  return EXTENSION_MAP[ext] || 'plaintext'
}
