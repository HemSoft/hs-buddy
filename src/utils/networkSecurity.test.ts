import { describe, expect, it } from 'vitest'
import {
  isPrivateIPv6,
  isPrivateIP,
  isInternalHostname,
  decodeHtmlEntities,
  extractTitleTag,
  extractOgTitle,
  extractPageTitle,
} from './networkSecurity'

// --- isPrivateIPv6 ---

describe('isPrivateIPv6', () => {
  it('detects loopback ::1', () => {
    expect(isPrivateIPv6('::1')).toBe(true)
  })

  it('detects link-local fe80:', () => {
    expect(isPrivateIPv6('fe80::1')).toBe(true)
  })

  it('detects ULA fc00::', () => {
    expect(isPrivateIPv6('fc00::1')).toBe(true)
  })

  it('detects ULA fd00::', () => {
    expect(isPrivateIPv6('fd12::abc')).toBe(true)
  })

  it('returns false for public IPv6', () => {
    expect(isPrivateIPv6('2001:db8::1')).toBe(false)
  })
})

// --- isPrivateIP ---

describe('isPrivateIP', () => {
  // IPv4 private ranges
  it('detects 127.0.0.1', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true)
  })

  it('detects 127.x.x.x loopback', () => {
    expect(isPrivateIP('127.255.255.255')).toBe(true)
  })

  it('detects 0.0.0.0', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true)
  })

  it('detects 10.x.x.x', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true)
  })

  it('detects 192.168.x.x', () => {
    expect(isPrivateIP('192.168.1.1')).toBe(true)
  })

  it('detects 169.254.x.x link-local', () => {
    expect(isPrivateIP('169.254.0.1')).toBe(true)
  })

  it('detects 172.16-31.x.x', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true)
    expect(isPrivateIP('172.31.255.255')).toBe(true)
    expect(isPrivateIP('172.20.0.1')).toBe(true)
  })

  it('returns false for 172.32.x.x', () => {
    expect(isPrivateIP('172.32.0.1')).toBe(false)
  })

  it('returns false for public IPv4', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false)
    expect(isPrivateIP('1.1.1.1')).toBe(false)
  })

  // IPv4-mapped IPv6
  it('strips ::ffff: prefix for IPv4-mapped IPv6', () => {
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false)
  })

  // IPv6
  it('detects IPv6 loopback', () => {
    expect(isPrivateIP('::1')).toBe(true)
  })

  it('detects IPv6 link-local', () => {
    expect(isPrivateIP('fe80::1')).toBe(true)
  })

  it('detects IPv6 ULA', () => {
    expect(isPrivateIP('fc00::1')).toBe(true)
  })

  it('returns false for public IPv6', () => {
    expect(isPrivateIP('2001:db8::1')).toBe(false)
  })

  it('handles uppercase IPv6', () => {
    expect(isPrivateIP('FE80::1')).toBe(true)
  })
})

// --- isInternalHostname ---

describe('isInternalHostname', () => {
  it('blocks localhost', () => {
    expect(isInternalHostname('localhost')).toBe(true)
  })

  it('blocks 127.0.0.1', () => {
    expect(isInternalHostname('127.0.0.1')).toBe(true)
  })

  it('blocks [::1]', () => {
    expect(isInternalHostname('[::1]')).toBe(true)
  })

  it('blocks ::1', () => {
    expect(isInternalHostname('::1')).toBe(true)
  })

  it('blocks 10.x.x.x', () => {
    expect(isInternalHostname('10.0.0.1')).toBe(true)
  })

  it('blocks 192.168.x.x', () => {
    expect(isInternalHostname('192.168.1.1')).toBe(true)
  })

  it('blocks 169.254.x.x', () => {
    expect(isInternalHostname('169.254.0.1')).toBe(true)
  })

  it('blocks 172.16-31.x.x', () => {
    expect(isInternalHostname('172.16.0.1')).toBe(true)
    expect(isInternalHostname('172.31.0.1')).toBe(true)
  })

  it('blocks .local suffix', () => {
    expect(isInternalHostname('mypc.local')).toBe(true)
  })

  it('blocks .internal suffix', () => {
    expect(isInternalHostname('app.internal')).toBe(true)
  })

  it('allows external hostnames', () => {
    expect(isInternalHostname('github.com')).toBe(false)
    expect(isInternalHostname('api.example.com')).toBe(false)
  })

  it('does not block 172.32.x.x', () => {
    expect(isInternalHostname('172.32.0.1')).toBe(false)
  })
})

// --- decodeHtmlEntities ---

describe('decodeHtmlEntities', () => {
  it('decodes numeric entities', () => {
    expect(decodeHtmlEntities('&#65;&#66;')).toBe('AB')
  })

  it('decodes hex entities', () => {
    expect(decodeHtmlEntities('&#x41;&#x42;')).toBe('AB')
  })

  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&apos;&nbsp;')).toBe('&<>"\' ')
  })

  it('handles mixed content', () => {
    expect(decodeHtmlEntities('Hello &amp; &#87;orld')).toBe('Hello & World')
  })

  it('returns plain text unchanged', () => {
    expect(decodeHtmlEntities('Hello World')).toBe('Hello World')
  })
})

// --- extractTitleTag ---

describe('extractTitleTag', () => {
  it('extracts simple title', () => {
    expect(extractTitleTag('<html><head><title>Hello</title></head></html>')).toBe('Hello')
  })

  it('trims whitespace', () => {
    expect(extractTitleTag('<title>  Hello World  </title>')).toBe('Hello World')
  })

  it('collapses internal whitespace', () => {
    expect(extractTitleTag('<title>Hello\n  World</title>')).toBe('Hello World')
  })

  it('returns null when no title', () => {
    expect(extractTitleTag('<html><head></head></html>')).toBeNull()
  })

  it('handles title with attributes', () => {
    expect(extractTitleTag('<title lang="en">Test</title>')).toBe('Test')
  })
})

// --- extractOgTitle ---

describe('extractOgTitle', () => {
  it('extracts og:title from property-first meta tag', () => {
    expect(extractOgTitle('<meta property="og:title" content="OG Title">')).toBe('OG Title')
  })

  it('extracts og:title from content-first meta tag', () => {
    expect(extractOgTitle('<meta content="OG Title" property="og:title">')).toBe('OG Title')
  })

  it('returns null when no og:title', () => {
    expect(extractOgTitle('<meta property="og:description" content="desc">')).toBeNull()
  })

  it('handles single quotes in attributes', () => {
    expect(extractOgTitle("<meta property='og:title' content='Single Quoted'>")).toBe(
      'Single Quoted'
    )
  })
})

// --- extractPageTitle ---

describe('extractPageTitle', () => {
  it('prefers title tag over og:title', () => {
    const html = '<title>&amp; Title</title><meta property="og:title" content="OG">'
    expect(extractPageTitle(html)).toBe('& Title')
  })

  it('falls back to og:title when no title tag', () => {
    const html = '<meta property="og:title" content="OG Only">'
    expect(extractPageTitle(html)).toBe('OG Only')
  })

  it('returns null when neither exists', () => {
    expect(extractPageTitle('<html><body>No title</body></html>')).toBeNull()
  })

  it('decodes HTML entities in title tag', () => {
    expect(extractPageTitle('<title>A &amp; B</title>')).toBe('A & B')
  })

  it('decodes HTML entities in og:title', () => {
    const html = '<meta property="og:title" content="A &amp; B">'
    expect(extractPageTitle(html)).toBe('A & B')
  })
})
