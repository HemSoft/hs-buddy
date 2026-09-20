import { describe, expect, it } from 'vitest'
import { buildGitHubCliEnvironment } from './githubCliEnvironment'

describe('buildGitHubCliEnvironment', () => {
  it('removes Aspire TLS overrides that replace the GitHub CLI trust store', () => {
    const source = {
      SSL_CERT_DIR: String.raw`C:\Users\User\AppData\Local\Temp\aspire-abc.123\buddy-xyz\certs`,
      SSL_CERT_FILE: String.raw`C:\Users\User\AppData\Local\Temp\aspire-abc.123\buddy-xyz\cert.pem`,
      NODE_EXTRA_CA_CERTS: String.raw`C:\Users\User\AppData\Local\Temp\aspire-abc.123\buddy-xyz\cert.pem`,
      GH_CONFIG_DIR: String.raw`C:\Users\User\.config\gh`,
    }

    expect(buildGitHubCliEnvironment(source, 'token')).toEqual({
      NODE_EXTRA_CA_CERTS: source.NODE_EXTRA_CA_CERTS,
      GH_CONFIG_DIR: source.GH_CONFIG_DIR,
      GH_TOKEN: 'token',
    })
    expect(source).toHaveProperty('SSL_CERT_DIR')
    expect(source).toHaveProperty('SSL_CERT_FILE')
  })

  it('preserves user-managed certificate configuration', () => {
    const source = {
      SSL_CERT_DIR: String.raw`C:\company\certs`,
      SSL_CERT_FILE: String.raw`C:\company\root.pem`,
      NODE_EXTRA_CA_CERTS: String.raw`C:\company\root.pem`,
    }

    expect(buildGitHubCliEnvironment(source)).toEqual(source)
  })

  it('recognizes Aspire certificate paths on POSIX hosts', () => {
    const extraCert = '/tmp/aspire-abc.123/buddy-xyz/cert.pem'
    expect(
      buildGitHubCliEnvironment({
        SSL_CERT_DIR: '/tmp/aspire-abc.123/buddy-xyz/certs',
        NODE_EXTRA_CA_CERTS: extraCert,
      })
    ).toEqual({ NODE_EXTRA_CA_CERTS: extraCert })
  })
})
