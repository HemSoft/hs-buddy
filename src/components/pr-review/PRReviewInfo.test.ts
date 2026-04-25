import { describe, expect, it } from 'vitest'
import { parsePRReviewInfo, type PRReviewInfo } from './PRReviewInfo'

describe('parsePRReviewInfo', () => {
  const sampleInfo: PRReviewInfo = {
    prUrl: 'https://github.com/org/repo/pull/42',
    prTitle: 'Fix login bug',
    prNumber: 42,
    repo: 'repo',
    org: 'org',
    author: 'alice',
  }

  function encode(info: PRReviewInfo): string {
    return `pr-review:${encodeURIComponent(JSON.stringify(info))}`
  }

  it('parses a valid encoded PRReviewInfo', () => {
    expect(parsePRReviewInfo(encode(sampleInfo))).toEqual(sampleInfo)
  })

  it('parses PRReviewInfo with optional initialPrompt', () => {
    const infoWithPrompt: PRReviewInfo = {
      ...sampleInfo,
      initialPrompt: 'Review the error handling',
    }

    const result = parsePRReviewInfo(encode(infoWithPrompt))

    expect(result).toEqual(infoWithPrompt)
    expect(result?.initialPrompt).toBe('Review the error handling')
  })

  it('handles special characters in fields', () => {
    const infoWithSpecialCharacters: PRReviewInfo = {
      ...sampleInfo,
      prTitle: 'feat: add "quotes" & (angle) brackets',
      author: 'user-name_123',
    }

    expect(parsePRReviewInfo(encode(infoWithSpecialCharacters))).toEqual(infoWithSpecialCharacters)
  })

  it('handles unicode characters in title', () => {
    const infoWithUnicode: PRReviewInfo = {
      ...sampleInfo,
      prTitle: 'Fix emoji 🐛 and accents café',
    }

    expect(parsePRReviewInfo(encode(infoWithUnicode))).toEqual(infoWithUnicode)
  })

  it('returns null for viewId without pr-review prefix', () => {
    expect(parsePRReviewInfo('other-prefix:data')).toBeNull()
    expect(parsePRReviewInfo('pr-reviews:data')).toBeNull()
    expect(parsePRReviewInfo('PR-REVIEW:data')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePRReviewInfo('')).toBeNull()
  })

  it('returns null when encoded portion is empty', () => {
    expect(parsePRReviewInfo('pr-review:')).toBeNull()
  })

  it('returns null for invalid JSON after prefix', () => {
    expect(parsePRReviewInfo('pr-review:not-valid-json')).toBeNull()
    expect(parsePRReviewInfo('pr-review:{broken')).toBeNull()
  })

  it('returns null for invalid URI encoding', () => {
    expect(parsePRReviewInfo('pr-review:%ZZ%invalid')).toBeNull()
  })

  it('parses non-encoded JSON', () => {
    const raw = `pr-review:${JSON.stringify(sampleInfo)}`

    expect(parsePRReviewInfo(raw)).toEqual(sampleInfo)
  })
})
