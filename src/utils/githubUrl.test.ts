import { describe, expect, it } from 'vitest'
import {
  parseOwnerRepoFromUrl,
  formatFileStatus,
  getRepoShortName,
  parseOwnerRepoKey,
} from './githubUrl'

describe('parseOwnerRepoFromUrl', () => {
  it('extracts owner and repo from a PR URL', () => {
    const result = parseOwnerRepoFromUrl('https://github.com/acme/widget/pull/42')
    expect(result).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('returns null for non-PR GitHub URLs', () => {
    expect(parseOwnerRepoFromUrl('https://github.com/acme/widget')).toBeNull()
  })

  it('returns null for non-GitHub URLs', () => {
    expect(parseOwnerRepoFromUrl('https://gitlab.com/acme/widget/pull/1')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseOwnerRepoFromUrl('')).toBeNull()
  })
})

describe('formatFileStatus', () => {
  it('replaces hyphens with spaces', () => {
    expect(formatFileStatus('added-removed')).toBe('added removed')
  })

  it('handles strings without hyphens', () => {
    expect(formatFileStatus('modified')).toBe('modified')
  })
})

describe('getRepoShortName', () => {
  it('extracts repo name from owner/repo format', () => {
    expect(getRepoShortName('acme/widget')).toBe('widget')
  })

  it('returns the full string when no slash is present', () => {
    expect(getRepoShortName('widget')).toBe('widget')
  })

  it('handles deeply nested paths by returning second segment', () => {
    expect(getRepoShortName('org/repo/extra')).toBe('repo')
  })

  it('falls back to full string when second segment is empty', () => {
    expect(getRepoShortName('owner/')).toBe('owner/')
  })

  it('falls back to full string for leading slash', () => {
    expect(getRepoShortName('/repo')).toBe('repo')
  })
})

describe('parseOwnerRepoKey', () => {
  it('parses a standard owner/repo key', () => {
    expect(parseOwnerRepoKey('acme/widget')).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('handles repos with slashes in the name', () => {
    expect(parseOwnerRepoKey('acme/my/nested/repo')).toEqual({
      owner: 'acme',
      repo: 'my/nested/repo',
    })
  })

  it('returns null for empty string', () => {
    expect(parseOwnerRepoKey('')).toBeNull()
  })

  it('returns null for owner-only string', () => {
    expect(parseOwnerRepoKey('acme')).toBeNull()
  })

  it('returns null when repo part is empty', () => {
    expect(parseOwnerRepoKey('acme/')).toBeNull()
  })
})
