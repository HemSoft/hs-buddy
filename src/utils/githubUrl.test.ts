import { describe, expect, it } from 'vitest'
import {
  parseOwnerRepoFromUrl,
  formatFileStatus,
  getRepoShortName,
  parseOwnerRepoKey,
  parseGitRemote,
  isGitHubHost,
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

describe('parseGitRemote', () => {
  it('parses HTTPS GitHub URL', () => {
    const result = parseGitRemote('https://github.com/acme/widget')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'https' })
  })

  it('parses HTTPS URL with .git suffix', () => {
    const result = parseGitRemote('https://github.com/acme/widget.git')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'https' })
  })

  it('parses HTTPS URL with credentials', () => {
    const result = parseGitRemote('https://user@github.com/acme/widget.git')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'https' })
  })

  it('parses SSH colon-separated URL', () => {
    const result = parseGitRemote('git@github.com:acme/widget.git')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'ssh' })
  })

  it('parses SSH protocol URL', () => {
    const result = parseGitRemote('ssh://git@github.com/acme/widget.git')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'ssh' })
  })

  it('parses SSH alias (non-github host)', () => {
    const result = parseGitRemote('git@my-alias:acme/widget.git')
    expect(result).toEqual({ host: 'my-alias', slug: 'acme/widget', scheme: 'ssh' })
  })

  it('handles enterprise GitHub host', () => {
    const result = parseGitRemote('https://git.enterprise.com/org/repo')
    expect(result).toEqual({ host: 'git.enterprise.com', slug: 'org/repo', scheme: 'https' })
  })

  it('returns null for empty string', () => {
    expect(parseGitRemote('')).toBeNull()
  })

  it('returns null for non-URL string', () => {
    expect(parseGitRemote('not a url')).toBeNull()
  })

  it('returns null for URL without owner/repo', () => {
    expect(parseGitRemote('https://github.com/')).toBeNull()
  })

  it('parses HTTP URL (non-secure)', () => {
    const result = parseGitRemote('http://github.com/acme/widget')
    expect(result).toEqual({ host: 'github.com', slug: 'acme/widget', scheme: 'http' })
  })

  it('strips .git suffix from SSH URLs', () => {
    const result = parseGitRemote('git@github.com:org/repo.git')
    expect(result?.slug).toBe('org/repo')
  })

  it('parses HTTPS URL with dotted repo name', () => {
    const result = parseGitRemote('https://github.com/org/my.repo.name')
    expect(result).toEqual({ host: 'github.com', slug: 'org/my.repo.name', scheme: 'https' })
  })

  it('strips .git from dotted repo name', () => {
    const result = parseGitRemote('https://github.com/org/my.repo.git')
    expect(result).toEqual({ host: 'github.com', slug: 'org/my.repo', scheme: 'https' })
  })

  it('parses SSH URL with dotted repo name', () => {
    const result = parseGitRemote('git@github.com:org/my.repo.name.git')
    expect(result).toEqual({ host: 'github.com', slug: 'org/my.repo.name', scheme: 'ssh' })
  })
})

describe('isGitHubHost', () => {
  it('returns true for github.com', () => {
    expect(isGitHubHost('github.com')).toBe(true)
  })

  it('returns true for GitHub Enterprise subdomain', () => {
    expect(isGitHubHost('api.github.com')).toBe(true)
  })

  it('returns true with leading/trailing whitespace', () => {
    expect(isGitHubHost('  github.com  ')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isGitHubHost('GitHub.com')).toBe(true)
    expect(isGitHubHost('GITHUB.COM')).toBe(true)
  })

  it('returns false for non-GitHub hosts', () => {
    expect(isGitHubHost('gitlab.com')).toBe(false)
    expect(isGitHubHost('bitbucket.org')).toBe(false)
  })

  it('returns false for partial matches', () => {
    expect(isGitHubHost('notgithub.com')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isGitHubHost('')).toBe(false)
  })
})
