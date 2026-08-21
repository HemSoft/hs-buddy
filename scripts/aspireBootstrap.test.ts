import { describe, expect, it } from 'vitest'
import {
  describeVersionAlignment,
  readPinnedSdkVersion,
  shouldSpawnThroughShell,
} from './aspireBootstrap'

const configJson = JSON.stringify({
  appHost: { path: 'aspire-apphost/apphost.mts' },
  sdk: { version: '13.5.0-preview.1.26310.3' },
})

describe('readPinnedSdkVersion', () => {
  it('reads the pinned SDK version from aspire.config.json contents', () => {
    expect(readPinnedSdkVersion(configJson)).toBe('13.5.0-preview.1.26310.3')
  })

  it('returns undefined when the sdk section or version is missing', () => {
    expect(readPinnedSdkVersion('{}')).toBeUndefined()
    expect(readPinnedSdkVersion(JSON.stringify({ sdk: {} }))).toBeUndefined()
    expect(readPinnedSdkVersion(JSON.stringify({ sdk: { version: '  ' } }))).toBeUndefined()
  })

  it('returns undefined for malformed config contents', () => {
    expect(readPinnedSdkVersion('not json at all')).toBeUndefined()
  })
})

describe('describeVersionAlignment', () => {
  it('matches when the installed version contains the pinned version', () => {
    expect(describeVersionAlignment('13.5.0-preview', '13.5.0-preview.1.26310.3')).toBe('match')
  })

  it('reports drift when the installed version differs from the pin', () => {
    expect(describeVersionAlignment('13.5.0-preview.1.26310.3', '13.6.0-other')).toBe('mismatch')
  })

  it('reports unknown when the CLI version cannot be determined and unpinned without a pin', () => {
    expect(describeVersionAlignment('13.5.0', undefined)).toBe('unknown')
    expect(describeVersionAlignment(undefined, '13.5.0')).toBe('unpinned')
    expect(describeVersionAlignment(undefined, undefined)).toBe('unpinned')
  })
})

describe('shouldSpawnThroughShell', () => {
  it('uses a shell only on Windows so .cmd shims resolve', () => {
    expect(shouldSpawnThroughShell('win32')).toBe(true)
    expect(shouldSpawnThroughShell('linux')).toBe(false)
    expect(shouldSpawnThroughShell('darwin')).toBe(false)
  })
})
