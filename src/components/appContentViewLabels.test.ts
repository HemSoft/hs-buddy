import { describe, expect, it } from 'vitest'
import { getViewLabel, viewLabels } from './appContentViewLabels'

describe('viewLabels', () => {
  it('contains expected PR mode labels', () => {
    expect(viewLabels['pr-my-prs']).toBe('My PRs')
    expect(viewLabels['pr-needs-review']).toBe('Needs Review')
    expect(viewLabels['pr-recently-merged']).toBe('Recently Merged')
    expect(viewLabels['pr-need-a-nudge']).toBe('Needs a nudge')
  })

  it('contains settings labels', () => {
    expect(viewLabels['settings-accounts']).toBe('Accounts')
    expect(viewLabels['settings-appearance']).toBe('Appearance')
    expect(viewLabels['settings-advanced']).toBe('Advanced')
  })

  it('contains automation labels', () => {
    expect(viewLabels['automation-schedules']).toBe('Schedules')
    expect(viewLabels['automation-runs']).toBe('Runs')
  })
})

describe('getViewLabel', () => {
  it('returns the static label for known view IDs', () => {
    expect(getViewLabel('pr-my-prs')).toBe('My PRs')
    expect(getViewLabel('copilot-usage')).toBe('Copilot Usage')
    expect(getViewLabel('crew-projects')).toBe('The Crew')
  })

  it('returns the view ID as-is for unknown labels', () => {
    expect(getViewLabel('totally-unknown')).toBe('totally-unknown')
  })

  describe('crew-project: prefix', () => {
    it('returns "Project Session"', () => {
      expect(getViewLabel('crew-project:abc123')).toBe('Project Session')
    })
  })

  describe('repo-detail: prefix', () => {
    it('extracts the repo name', () => {
      expect(getViewLabel('repo-detail:acme/widget')).toBe('widget')
    })

    it('handles single-segment slug', () => {
      expect(getViewLabel('repo-detail:myrepo')).toBe('myrepo')
    })
  })

  describe('org-detail: prefix', () => {
    it('formats as org overview', () => {
      expect(getViewLabel('org-detail:acme-corp')).toBe('acme-corp Overview')
    })
  })

  describe('org-user: prefix', () => {
    it('formats as org · user', () => {
      expect(getViewLabel('org-user:acme/alice')).toBe('acme · alice')
    })

    it('returns raw value when no slash', () => {
      expect(getViewLabel('org-user:alice')).toBe('alice')
    })
  })

  describe('repo-commits: prefix', () => {
    it('formats as repo Commits', () => {
      expect(getViewLabel('repo-commits:acme/widget')).toBe('widget Commits')
    })
  })

  describe('repo-commit: prefix', () => {
    it('formats as repo · short SHA', () => {
      expect(getViewLabel('repo-commit:acme/widget/abc1234567890')).toBe('widget · abc1234')
    })
  })

  describe('repo-issue: prefix', () => {
    it('formats as repo · #number', () => {
      expect(getViewLabel('repo-issue:acme/widget/42')).toBe('widget · #42')
    })
  })

  describe('repo-issues: prefix', () => {
    it('formats as repo Issues', () => {
      expect(getViewLabel('repo-issues:acme/widget')).toBe('widget Issues')
    })
  })

  describe('repo-issues-closed: prefix', () => {
    it('formats as repo Closed Issues', () => {
      expect(getViewLabel('repo-issues-closed:acme/widget')).toBe('widget Closed Issues')
    })
  })

  describe('repo-prs: prefix', () => {
    it('formats as repo PRs', () => {
      expect(getViewLabel('repo-prs:acme/widget')).toBe('widget PRs')
    })
  })

  describe('repo-prs-closed: prefix', () => {
    it('formats as repo Closed PRs', () => {
      expect(getViewLabel('repo-prs-closed:acme/widget')).toBe('widget Closed PRs')
    })
  })

  describe('copilot-result: prefix', () => {
    it('returns "Copilot Result"', () => {
      expect(getViewLabel('copilot-result:xyz')).toBe('Copilot Result')
    })
  })

  describe('job-detail: prefix', () => {
    it('returns "Job Detail"', () => {
      expect(getViewLabel('job-detail:abc')).toBe('Job Detail')
    })
  })

  describe('schedule-detail: prefix', () => {
    it('returns "Schedule Detail"', () => {
      expect(getViewLabel('schedule-detail:abc')).toBe('Schedule Detail')
    })
  })

  describe('pr-review: prefix', () => {
    it('decodes and truncates the PR title at 30 chars', () => {
      const info = { prTitle: 'Fix the very long PR title that exceeds thirty characters limit' }
      const encoded = encodeURIComponent(JSON.stringify(info))
      // Code slices at 30 chars: "Fix the very long PR title tha" + "…"
      expect(getViewLabel(`pr-review:${encoded}`)).toBe('Review: Fix the very long PR title tha…')
    })

    it('returns short titles without truncation', () => {
      const info = { prTitle: 'Short title' }
      const encoded = encodeURIComponent(JSON.stringify(info))
      expect(getViewLabel(`pr-review:${encoded}`)).toBe('Review: Short title')
    })

    it('returns "PR Review" for invalid JSON', () => {
      expect(getViewLabel('pr-review:invalid-json')).toBe('PR Review')
    })
  })

  describe('browser: prefix', () => {
    it('extracts hostname from a valid URL', () => {
      const encoded = encodeURIComponent('https://example.com/path')
      expect(getViewLabel(`browser:${encoded}`)).toBe('example.com')
    })

    it('returns "Browser" for an invalid URL', () => {
      expect(getViewLabel('browser:not-a-valid-url')).toBe('Browser')
    })
  })

  describe('bookmarks-category: prefix', () => {
    it('returns the category name', () => {
      expect(getViewLabel('bookmarks-category:work')).toBe('work')
    })
  })

  describe('copilot-session-detail: prefix', () => {
    it('returns "Session Detail"', () => {
      expect(getViewLabel('copilot-session-detail:abc123')).toBe('Session Detail')
    })
  })

  describe('pr-detail: prefix', () => {
    it('returns "PR Detail" as fallback for invalid route', () => {
      expect(getViewLabel('pr-detail:invalid')).toBe('PR Detail')
    })

    it('formats with repo and PR number for a valid route', () => {
      const info = {
        source: 'github',
        repository: 'my-repo',
        id: 42,
        title: 'Fix bug',
        author: 'alice',
        url: 'https://github.com/org/my-repo/pull/42',
        state: 'open',
        approvalCount: 0,
        assigneeCount: 0,
        iApproved: false,
        created: null,
        date: null,
      }
      const encoded = encodeURIComponent(JSON.stringify(info))
      expect(getViewLabel(`pr-detail:${encoded}`)).toBe('#42 my-repo')
    })

    it('includes section label when section is present', () => {
      const info = {
        source: 'github',
        repository: 'my-repo',
        id: 42,
        title: 'Fix bug',
        author: 'alice',
        url: 'https://github.com/org/my-repo/pull/42',
        state: 'open',
        approvalCount: 0,
        assigneeCount: 0,
        iApproved: false,
        created: null,
        date: null,
      }
      const encoded = encodeURIComponent(JSON.stringify(info))
      expect(getViewLabel(`pr-detail:${encoded}?section=checks`)).toBe('#42 my-repo · Checks')
    })
  })
})
