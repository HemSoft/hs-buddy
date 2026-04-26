import { describe, it, expect } from 'vitest'
import { SKIPPED_DIRECTORIES, shouldIncludeDirEntry, compareDirEntries } from './dirEntryUtils'

describe('SKIPPED_DIRECTORIES', () => {
  it('contains the expected directory names', () => {
    expect(SKIPPED_DIRECTORIES.has('node_modules')).toBe(true)
    expect(SKIPPED_DIRECTORIES.has('__pycache__')).toBe(true)
    expect(SKIPPED_DIRECTORIES.has('.git')).toBe(true)
    expect(SKIPPED_DIRECTORIES.has('src')).toBe(false)
  })
})

describe('shouldIncludeDirEntry', () => {
  it('excludes hidden files (dot-prefix)', () => {
    expect(shouldIncludeDirEntry('.env', false)).toBe(false)
    expect(shouldIncludeDirEntry('.gitignore', false)).toBe(false)
  })

  it('excludes hidden directories', () => {
    expect(shouldIncludeDirEntry('.vscode', true)).toBe(false)
  })

  it('excludes skipped directories', () => {
    expect(shouldIncludeDirEntry('node_modules', true)).toBe(false)
    expect(shouldIncludeDirEntry('__pycache__', true)).toBe(false)
  })

  it('includes normal files', () => {
    expect(shouldIncludeDirEntry('package.json', false)).toBe(true)
    expect(shouldIncludeDirEntry('README.md', false)).toBe(true)
  })

  it('includes normal directories', () => {
    expect(shouldIncludeDirEntry('src', true)).toBe(true)
    expect(shouldIncludeDirEntry('lib', true)).toBe(true)
  })

  it('does not skip node_modules when treated as a file', () => {
    expect(shouldIncludeDirEntry('node_modules', false)).toBe(true)
  })
})

describe('compareDirEntries', () => {
  it('sorts directories before files', () => {
    const dir = { type: 'directory' as const, name: 'z' }
    const file = { type: 'file' as const, name: 'a' }
    expect(compareDirEntries(dir, file)).toBeLessThan(0)
    expect(compareDirEntries(file, dir)).toBeGreaterThan(0)
  })

  it('sorts same-type entries alphabetically case-insensitive', () => {
    const a = { type: 'file' as const, name: 'Alpha' }
    const b = { type: 'file' as const, name: 'beta' }
    expect(compareDirEntries(a, b)).toBeLessThan(0)
    expect(compareDirEntries(b, a)).toBeGreaterThan(0)
  })

  it('returns 0 for identical entries', () => {
    const a = { type: 'file' as const, name: 'test' }
    const b = { type: 'file' as const, name: 'test' }
    expect(compareDirEntries(a, b)).toBe(0)
  })

  it('sorts directories among themselves alphabetically', () => {
    const a = { type: 'directory' as const, name: 'src' }
    const b = { type: 'directory' as const, name: 'lib' }
    expect(compareDirEntries(a, b)).toBeGreaterThan(0)
    expect(compareDirEntries(b, a)).toBeLessThan(0)
  })
})
