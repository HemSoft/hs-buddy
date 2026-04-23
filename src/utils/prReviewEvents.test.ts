import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildReReviewPrompt, dispatchPRReviewOpen } from './prReviewEvents'
import type { PRReviewInfo } from '../components/pr-review/PRReviewInfo'

describe('dispatchPRReviewOpen', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent')
  })

  afterEach(() => {
    dispatchSpy.mockRestore()
  })

  it('dispatches pr-review:open CustomEvent with the provided info', () => {
    const info: PRReviewInfo = {
      prUrl: 'https://github.com/org/repo/pull/42',
      prTitle: 'Fix the thing',
      prNumber: 42,
      repo: 'repo',
      org: 'org',
      author: 'alice',
    }

    dispatchPRReviewOpen(info)

    expect(dispatchSpy).toHaveBeenCalledOnce()
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe('pr-review:open')
    expect(event.detail).toEqual(info)
  })

  it('includes initialPrompt when provided', () => {
    const info: PRReviewInfo = {
      prUrl: 'https://github.com/org/repo/pull/1',
      prTitle: 'PR',
      prNumber: 1,
      repo: 'repo',
      org: 'org',
      author: 'bob',
      initialPrompt: 'Please re-review',
    }

    dispatchPRReviewOpen(info)

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(event.detail.initialPrompt).toBe('Please re-review')
  })
})

describe('buildReReviewPrompt', () => {
  const prUrl = 'https://github.com/org/repo/pull/42'

  it('builds a SHA-focused prompt when reviewedHeadSha is provided', () => {
    const result = buildReReviewPrompt(prUrl, 'abc123')

    expect(result).toContain(prUrl)
    expect(result).toContain('abc123')
    expect(result).toContain('after commit abc123')
    expect(result).toContain('unresolved or outdated review conversations')
    expect(result).toContain('verify whether prior findings are addressed')
  })

  it('builds a general re-review prompt when no SHA is provided', () => {
    const result = buildReReviewPrompt(prUrl)

    expect(result).toContain(prUrl)
    expect(result).toContain('targeted re-review')
    expect(result).toContain('newly pushed commits')
  })

  it('builds a general re-review prompt when SHA is null', () => {
    const result = buildReReviewPrompt(prUrl, null)

    expect(result).toContain('targeted re-review')
  })

  it('builds a general re-review prompt when SHA is empty string', () => {
    const result = buildReReviewPrompt(prUrl, '')

    expect(result).toContain('targeted re-review')
  })
})
