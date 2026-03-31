import { describe, expect, it } from 'vitest'
import { getDiffLineClass } from './diffUtils'

describe('getDiffLineClass', () => {
  it('returns hunk class for @@ lines', () => {
    expect(getDiffLineClass('@@ -1,3 +1,5 @@')).toBe(
      'repo-commit-diff-line repo-commit-diff-line-hunk'
    )
  })

  it('returns added class for + lines', () => {
    expect(getDiffLineClass('+added line')).toBe(
      'repo-commit-diff-line repo-commit-diff-line-added'
    )
  })

  it('returns removed class for - lines', () => {
    expect(getDiffLineClass('-removed line')).toBe(
      'repo-commit-diff-line repo-commit-diff-line-removed'
    )
  })

  it('returns base class for context lines', () => {
    expect(getDiffLineClass(' context line')).toBe('repo-commit-diff-line')
    expect(getDiffLineClass('plain text')).toBe('repo-commit-diff-line')
    expect(getDiffLineClass('')).toBe('repo-commit-diff-line')
  })
})
