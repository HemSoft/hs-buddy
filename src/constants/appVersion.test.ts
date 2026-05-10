import { describe, expect, it } from 'vitest'
import { APP_VERSION } from './appVersion'

describe('APP_VERSION', () => {
  it('exports a version string', () => {
    expect(typeof APP_VERSION).toBe('string')
    expect(APP_VERSION.length).toBeGreaterThan(0)
  })

  it('follows semver-ish format', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
