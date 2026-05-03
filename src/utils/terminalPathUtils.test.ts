import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  isValidRepoSlug,
  getOrgCandidates,
  getCloneRoots,
  processOsc7Buffer,
  buildTerminalShellArgs,
  buildPtySpawnOptions,
  findRepoPath,
} from './terminalPathUtils'

/** Build a platform-native path from posix-style segments. */
const p = (...segments: string[]) => path.join(...segments)

// ─── isValidRepoSlug ────────────────────────────────────

describe('isValidRepoSlug', () => {
  it('accepts normal repo names', () => {
    expect(isValidRepoSlug('my-repo')).toBe(true)
    expect(isValidRepoSlug('repo123')).toBe(true)
    expect(isValidRepoSlug('A_Repo.name')).toBe(true)
  })

  it('rejects non-strings', () => {
    expect(isValidRepoSlug(null)).toBe(false)
    expect(isValidRepoSlug(undefined)).toBe(false)
    expect(isValidRepoSlug(42)).toBe(false)
    expect(isValidRepoSlug({})).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidRepoSlug('')).toBe(false)
  })

  it('rejects traversal names', () => {
    expect(isValidRepoSlug('.')).toBe(false)
    expect(isValidRepoSlug('..')).toBe(false)
    expect(isValidRepoSlug('-bad')).toBe(false)
    expect(isValidRepoSlug('_bad')).toBe(false)
  })

  it('rejects names with special chars', () => {
    expect(isValidRepoSlug('repo/name')).toBe(false)
    expect(isValidRepoSlug('repo name')).toBe(false)
    expect(isValidRepoSlug('repo@name')).toBe(false)
  })
})

// ─── getOrgCandidates ───────────────────────────────────

describe('getOrgCandidates', () => {
  it('returns exact and capitalized for simple owner', () => {
    const result = getOrgCandidates('github')
    expect(result).toContain('github')
    expect(result).toContain('Github')
  })

  it('includes short form and capitalized short for hyphenated owner', () => {
    const result = getOrgCandidates('relias-engineering')
    expect(result).toContain('relias-engineering')
    expect(result).toContain('relias')
    expect(result).toContain('Relias')
    expect(result).toContain('Relias-engineering')
  })

  it('deduplicates when owner starts with uppercase', () => {
    const result = getOrgCandidates('Github')
    // 'Github' appears once as both exact and capitalized
    const count = result.filter(c => c === 'Github').length
    expect(count).toBe(1)
  })

  it('does not add short form when no hyphen', () => {
    const result = getOrgCandidates('octocat')
    expect(result).toEqual(['octocat', 'Octocat'])
  })
})

// ─── getCloneRoots ──────────────────────────────────────

describe('getCloneRoots', () => {
  it('includes common directories for unix', () => {
    const roots = getCloneRoots('darwin', '/Users/test')
    expect(roots).toContain(path.join('/Users/test', 'github'))
    expect(roots).toContain(path.join('/Users/test', 'repos'))
    expect(roots).toContain(path.join('/Users/test', 'projects'))
    expect(roots).toContain(path.join('/Users/test', 'source', 'repos'))
    // Also gets drive-root github
    expect(roots).toContain(path.join('/', 'github'))
  })

  it('includes Windows drive letters for win32', () => {
    const roots = getCloneRoots('win32', '/Users/test')
    expect(roots.some(r => r.includes('C:'))).toBe(true)
    expect(roots.some(r => r.includes('D:'))).toBe(true)
    expect(roots).toContain(path.join('/Users/test', 'github'))
  })

  it('does not include drive letters for linux', () => {
    const roots = getCloneRoots('linux', '/home/user')
    expect(roots.some(r => r.includes('C:'))).toBe(false)
  })
})

// ─── processOsc7Buffer ──────────────────────────────────

describe('processOsc7Buffer', () => {
  it('extracts cwd from a complete OSC 7 sequence (BEL terminator)', () => {
    const chunk = '\x1b]7;file://hostname/Users/test/project\x07'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('/Users/test/project')
    expect(result.remainingBuffer).toBe('')
  })

  it('extracts cwd from OSC 7 with ST terminator', () => {
    const chunk = '\x1b]7;file://hostname/home/user\x1b\\'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('/home/user')
  })

  it('returns null cwd when no OSC 7 in buffer', () => {
    const result = processOsc7Buffer('', 'hello world')
    expect(result.cwd).toBeNull()
    expect(result.remainingBuffer).toBe('hello world')
  })

  it('returns last match when multiple OSC 7 sequences present', () => {
    const chunk = '\x1b]7;file://h/old/path\x07' + 'some output' + '\x1b]7;file://h/new/path\x07'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('/new/path')
  })

  it('handles split sequences across chunks', () => {
    // First chunk has partial sequence
    const result1 = processOsc7Buffer('', '\x1b]7;file://h/')
    expect(result1.cwd).toBeNull()

    // Second chunk completes it
    const result2 = processOsc7Buffer(result1.remainingBuffer, 'Users/test\x07')
    expect(result2.cwd).toBe('/Users/test')
  })

  it('decodes percent-encoded paths', () => {
    const chunk = '\x1b]7;file://h/Users/test/my%20project\x07'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('/Users/test/my project')
  })

  it('caps buffer at 512 chars', () => {
    const longData = 'x'.repeat(600)
    const result = processOsc7Buffer('', longData)
    expect(result.remainingBuffer.length).toBe(512)
  })

  it('preserves remaining buffer after last match', () => {
    const chunk = '\x1b]7;file://h/cwd\x07trailing data'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('/cwd')
    expect(result.remainingBuffer).toBe('trailing data')
  })

  it('returns null cwd on malformed percent-encoding', () => {
    const chunk = '\x1b]7;file://h/bad%ZZpath\x07'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBeNull()
    expect(result.remainingBuffer).toBe('')
  })

  it('handles Windows drive-letter paths (file:///C:/...)', () => {
    const chunk = '\x1b]7;file:///C:/Users/test\x07'
    const result = processOsc7Buffer('', chunk)
    expect(result.cwd).toBe('C:/Users/test')
  })
})

// ─── buildTerminalShellArgs ─────────────────────────────

describe('buildTerminalShellArgs', () => {
  it('returns encoded command args for pwsh.exe on win32', () => {
    const args = buildTerminalShellArgs('pwsh.exe', 'win32')
    expect(args).toContain('-NoLogo')
    expect(args).toContain('-NoExit')
    expect(args).toContain('-EncodedCommand')
    expect(args.length).toBe(4)
  })

  it('returns encoded command args for powershell.exe on win32', () => {
    const args = buildTerminalShellArgs('powershell.exe', 'win32')
    expect(args).toContain('-EncodedCommand')
  })

  it('returns empty array for non-Windows platform', () => {
    expect(buildTerminalShellArgs('pwsh.exe', 'darwin')).toEqual([])
    expect(buildTerminalShellArgs('bash', 'linux')).toEqual([])
  })

  it('returns empty array for non-PowerShell shell on Windows', () => {
    expect(buildTerminalShellArgs('bash', 'win32')).toEqual([])
    expect(buildTerminalShellArgs('cmd.exe', 'win32')).toEqual([])
  })
})

// ─── buildPtySpawnOptions ───────────────────────────────

describe('buildPtySpawnOptions', () => {
  it('uses provided cols and rows', () => {
    const result = buildPtySpawnOptions(
      { cols: 80, rows: 24 },
      '/tmp',
      { PATH: '/usr/bin' },
      'darwin'
    )
    expect(result.cols).toBe(80)
    expect(result.rows).toBe(24)
    expect(result.cwd).toBe('/tmp')
    expect(result.name).toBe('xterm-256color')
  })

  it('defaults cols to 120 and rows to 30', () => {
    const result = buildPtySpawnOptions({}, '/tmp', {}, 'linux')
    expect(result.cols).toBe(120)
    expect(result.rows).toBe(30)
  })

  it('clones env rather than using the original reference', () => {
    const env = { PATH: '/usr/bin' }
    const result = buildPtySpawnOptions({}, '/tmp', env, 'darwin')
    expect(result.env).toEqual(env)
    expect(result.env).not.toBe(env)
  })

  it('adds useConpty on win32', () => {
    const result = buildPtySpawnOptions({}, 'C:\\Users', {}, 'win32')
    expect(result).toHaveProperty('useConpty', true)
  })

  it('does not add useConpty on non-win32', () => {
    const result = buildPtySpawnOptions({}, '/tmp', {}, 'darwin')
    expect(result).not.toHaveProperty('useConpty')
  })

  it('uses falsy fallback for cols=0 and rows=0', () => {
    const result = buildPtySpawnOptions({ cols: 0, rows: 0 }, '/tmp', {}, 'linux')
    expect(result.cols).toBe(120)
    expect(result.rows).toBe(30)
  })
})

// ─── findRepoPath ───────────────────────────────────────

describe('findRepoPath', () => {
  it('returns first matching candidate via org subfolder', () => {
    const validDirs = new Set(['/github', p('/github', 'acme', 'my-repo')])
    const result = findRepoPath(['/github'], ['acme', 'Acme'], 'my-repo', dir => validDirs.has(dir))
    expect(result).toBe(p('/github', 'acme', 'my-repo'))
  })

  it('skips roots that do not exist', () => {
    const validDirs = new Set(['/repos', p('/repos', 'acme', 'my-repo')])
    const result = findRepoPath(['/github', '/repos'], ['acme'], 'my-repo', dir =>
      validDirs.has(dir)
    )
    expect(result).toBe(p('/repos', 'acme', 'my-repo'))
  })

  it('falls back to direct root/repo when org subfolder does not match', () => {
    const validDirs = new Set(['/github', p('/github', 'my-repo')])
    const result = findRepoPath(['/github'], ['acme'], 'my-repo', dir => validDirs.has(dir))
    expect(result).toBe(p('/github', 'my-repo'))
  })

  it('returns null when no paths match', () => {
    const result = findRepoPath(['/github', '/repos'], ['acme'], 'missing-repo', () => false)
    expect(result).toBeNull()
  })

  it('earlier root beats later root', () => {
    const validDirs = new Set([
      '/first',
      p('/first', 'org', 'repo'),
      '/second',
      p('/second', 'org', 'repo'),
    ])
    const result = findRepoPath(['/first', '/second'], ['org'], 'repo', dir => validDirs.has(dir))
    expect(result).toBe(p('/first', 'org', 'repo'))
  })

  it('org subfolder beats direct match', () => {
    const validDirs = new Set(['/github', p('/github', 'acme', 'repo'), p('/github', 'repo')])
    const result = findRepoPath(['/github'], ['acme'], 'repo', dir => validDirs.has(dir))
    expect(result).toBe(p('/github', 'acme', 'repo'))
  })

  it('preserves org candidate order from getOrgCandidates', () => {
    const validDirs = new Set(['/root', p('/root', 'Acme', 'repo'), p('/root', 'acme', 'repo')])
    const result = findRepoPath(['/root'], ['acme', 'Acme'], 'repo', dir => validDirs.has(dir))
    expect(result).toBe(p('/root', 'acme', 'repo'))
  })

  it('skips root when org and direct candidates both fail', () => {
    // Root exists but neither org subfolder nor direct match exists
    const validDirs = new Set(['/root'])
    const result = findRepoPath(['/root'], ['acme'], 'missing', dir => validDirs.has(dir))
    expect(result).toBeNull()
  })
})
