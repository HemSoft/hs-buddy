import { describe, expect, it } from 'vitest'
import { parseOwnerRepoFromUrl, formatFileStatus } from './githubUrl'

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
