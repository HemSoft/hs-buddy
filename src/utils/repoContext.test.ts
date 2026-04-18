import { describe, expect, it } from 'vitest'
import { getRepoContextFromViewId } from './repoContext'

describe('getRepoContextFromViewId', () => {
  it('returns null for null input', () => {
    expect(getRepoContextFromViewId(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getRepoContextFromViewId('')).toBeNull()
  })

  it('returns null for unrecognized view IDs', () => {
    expect(getRepoContextFromViewId('settings')).toBeNull()
    expect(getRepoContextFromViewId('dashboard')).toBeNull()
    expect(getRepoContextFromViewId('unknown:foo/bar')).toBeNull()
  })

  // --- Simple prefixed views ---

  it('extracts owner/repo from repo-detail: prefix', () => {
    expect(getRepoContextFromViewId('repo-detail:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-commits: prefix', () => {
    expect(getRepoContextFromViewId('repo-commits:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-commit: prefix (single commit)', () => {
    expect(getRepoContextFromViewId('repo-commit:acme/widget/abc123')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-issues: prefix', () => {
    expect(getRepoContextFromViewId('repo-issues:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-issues-closed: prefix', () => {
    expect(getRepoContextFromViewId('repo-issues-closed:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-issue: prefix with issue number', () => {
    expect(getRepoContextFromViewId('repo-issue:acme/widget/42')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-prs: prefix', () => {
    expect(getRepoContextFromViewId('repo-prs:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('extracts owner/repo from repo-prs-closed: prefix', () => {
    expect(getRepoContextFromViewId('repo-prs-closed:acme/widget')).toEqual({
      owner: 'acme',
      repo: 'widget',
    })
  })

  it('returns null when slug has no slash (missing repo)', () => {
    expect(getRepoContextFromViewId('repo-detail:onlyowner')).toBeNull()
  })

  it('returns null when slug starts with a slash (no owner)', () => {
    expect(getRepoContextFromViewId('repo-detail:/widget')).toBeNull()
  })

  // --- PR detail views ---

  it('extracts owner/repo from pr-detail: with org field', () => {
    const pr = {
      source: 'github',
      repository: 'widget',
      id: 1,
      title: 'Fix',
      author: 'alice',
      url: 'https://github.com/acme/widget/pull/1',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
      org: 'acme',
    }
    const viewId = `pr-detail:${encodeURIComponent(JSON.stringify(pr))}`
    expect(getRepoContextFromViewId(viewId)).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('falls back to URL owner when org field is missing', () => {
    const pr = {
      source: 'github',
      repository: 'widget',
      id: 1,
      title: 'Fix',
      author: 'alice',
      url: 'https://github.com/fallback-org/widget/pull/1',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
    }
    const viewId = `pr-detail:${encodeURIComponent(JSON.stringify(pr))}`
    expect(getRepoContextFromViewId(viewId)).toEqual({ owner: 'fallback-org', repo: 'widget' })
  })

  it('extracts owner/repo from pr-detail: with owner/repo repository format', () => {
    const pr = {
      source: 'github',
      repository: 'acme/widget',
      id: 1,
      title: 'Fix',
      author: 'alice',
      url: 'https://github.com/acme/widget/pull/1',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
      org: 'some-org',
    }
    const viewId = `pr-detail:${encodeURIComponent(JSON.stringify(pr))}`
    // owner should be parsed from repository field, not from org
    expect(getRepoContextFromViewId(viewId)).toEqual({ owner: 'acme', repo: 'widget' })
  })

  it('returns null from pr-detail: when no owner can be determined', () => {
    const pr = {
      source: 'github',
      repository: '',
      id: 1,
      title: 'Fix',
      author: 'alice',
      url: 'invalid-url',
      state: 'open',
      approvalCount: 0,
      assigneeCount: 0,
      iApproved: false,
      created: null,
      date: null,
    }
    const viewId = `pr-detail:${encodeURIComponent(JSON.stringify(pr))}`
    expect(getRepoContextFromViewId(viewId)).toBeNull()
  })

  it('returns null for invalid pr-detail: JSON', () => {
    expect(getRepoContextFromViewId('pr-detail:not%20valid%20json')).toBeNull()
  })

  it('returns null for pr-detail: with no data after prefix', () => {
    expect(getRepoContextFromViewId('pr-detail:')).toBeNull()
  })
})
