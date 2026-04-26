import { describe, it, expect } from 'vitest'
import {
  isValidRepoSlug,
  getOrgCandidates,
  getCloneRoots,
  processOsc7Buffer,
  buildTerminalShellArgs,
} from './terminalPathUtils'

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
    expect(roots).toContain('/Users/test/github')
    expect(roots).toContain('/Users/test/repos')
    expect(roots).toContain('/Users/test/projects')
    expect(roots).toContain('/Users/test/source/repos')
    // Unix also gets drive-root github
    expect(roots).toContain('/github')
  })

  it('includes Windows drive letters for win32', () => {
    // Note: path.join on non-Windows normalizes backslashes to forward slashes
    // We test the structure, not exact separators
    const roots = getCloneRoots('win32', '/Users/test')
    expect(roots.some(r => r.includes('C:'))).toBe(true)
    expect(roots.some(r => r.includes('D:'))).toBe(true)
    expect(roots).toContain('/Users/test/github')
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
