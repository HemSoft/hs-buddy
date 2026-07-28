import { bench, describe } from 'vitest'
import { isInternalHostname, isPrivateIP, validateUrl } from './networkSecurity'

const MIXED_HOSTNAMES = [
  'github.com',
  'api.example.com',
  'localhost',
  '10.0.0.1',
  '172.20.0.1',
  'service.internal',
  '[::1]',
]

const IPV4_ADDRESSES = [
  '8.8.8.8',
  '1.1.1.1',
  '127.0.0.1',
  '10.0.0.1',
  '172.20.0.1',
  '192.168.1.1',
  '::ffff:169.254.0.1',
]

const IPV6_ADDRESSES = ['2001:4860:4860::8888', '::1', 'fe80::1', 'fc00::1', 'fd12::abc']

function validateRejectedUrl(url: string): void {
  try {
    validateUrl(url)
  } catch (_error: unknown) {
    return
  }
  throw new Error(`Expected URL to be rejected: ${url}`)
}

describe('URL validation', () => {
  bench('validateUrl - public HTTPS URL', () => {
    validateUrl('https://github.com/HemSoft/hs-buddy?tab=readme')
  })

  bench('validateUrl - public IPv4 URL', () => {
    validateUrl('https://8.8.8.8/dns-query')
  })

  bench('validateUrl - public IPv6 URL', () => {
    validateUrl('https://[2001:4860:4860::8888]/dns-query')
  })

  bench('validateUrl - private URL rejection', () => {
    validateRejectedUrl('https://192.168.1.10/admin')
  })

  bench('validateUrl - malformed URL rejection', () => {
    validateRejectedUrl('not-a-url')
  })
})

describe('network security classification', () => {
  bench('isInternalHostname - mixed hostnames', () => {
    for (const hostname of MIXED_HOSTNAMES) isInternalHostname(hostname)
  })

  bench('isPrivateIP - IPv4 batch', () => {
    for (const ip of IPV4_ADDRESSES) isPrivateIP(ip)
  })

  bench('isPrivateIP - IPv6 batch', () => {
    for (const ip of IPV6_ADDRESSES) isPrivateIP(ip)
  })
})
