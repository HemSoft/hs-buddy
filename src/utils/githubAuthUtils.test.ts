import { describe, it, expect } from 'vitest'
import {
  parseActiveGitHubAccount,
  buildGhAuthTokenArgs,
  isNonFatalGhStderr,
} from './githubAuthUtils'

describe('parseActiveGitHubAccount', () => {
  it('returns the active account from gh auth status output', () => {
    const stderr = [
      'github.com',
      '  ✓ Logged in to github.com account octocat (keyring)',
      '  - Active account: true',
      '  - Git operations protocol: https',
    ].join('\n')
    expect(parseActiveGitHubAccount(stderr)).toBe('octocat')
  })

  it('returns null when no active account found', () => {
    const stderr = [
      'github.com',
      '  ✓ Logged in to github.com account octocat (keyring)',
      '  - Active account: false',
    ].join('\n')
    expect(parseActiveGitHubAccount(stderr)).toBeNull()
  })

  it('handles multiple accounts and picks the active one', () => {
    const stderr = [
      'github.com',
      '  ✓ Logged in to github.com account bot-user (keyring)',
      '  - Active account: false',
      '  - Git operations protocol: https',
      '  - Token: gho_****',
      '  - Token scopes: gist, read:org, repo, workflow',
      '',
      '  ✓ Logged in to github.com account human-user (keyring)',
      '  - Active account: true',
    ].join('\n')
    expect(parseActiveGitHubAccount(stderr)).toBe('human-user')
  })

  it('returns null for empty stderr', () => {
    expect(parseActiveGitHubAccount('')).toBeNull()
  })

  it('returns null when output has no account lines', () => {
    const stderr = 'You are not logged in to any GitHub hosts.\n'
    expect(parseActiveGitHubAccount(stderr)).toBeNull()
  })

  it('only looks ahead 4 lines for active marker', () => {
    const lines = [
      '  ✓ Logged in to github.com account distant (keyring)',
      '',
      '',
      '',
      '',
      '',
      '  - Active account: true',
    ]
    expect(parseActiveGitHubAccount(lines.join('\n'))).toBeNull()
  })
})

describe('buildGhAuthTokenArgs', () => {
  it('returns base args when no username', () => {
    expect(buildGhAuthTokenArgs()).toEqual(['auth', 'token'])
  })

  it('returns base args for undefined username', () => {
    expect(buildGhAuthTokenArgs(undefined)).toEqual(['auth', 'token'])
  })

  it('appends --user flag when username provided', () => {
    expect(buildGhAuthTokenArgs('octocat')).toEqual(['auth', 'token', '--user', 'octocat'])
  })
})

describe('isNonFatalGhStderr', () => {
  it('returns true for login info messages', () => {
    expect(isNonFatalGhStderr('Logging in to github.com...')).toBe(true)
  })

  it('returns false for actual error messages', () => {
    expect(isNonFatalGhStderr('error: authentication failed')).toBe(false)
  })

  it('returns false for empty stderr', () => {
    expect(isNonFatalGhStderr('')).toBe(false)
  })
})
