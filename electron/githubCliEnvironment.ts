function pathParts(value: string): string[] {
  return value
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .map(part => part.toLowerCase())
}

function hasSameParent(left: string, right: string): boolean {
  const leftParent = pathParts(left).slice(0, -1).join('/')
  const rightParent = pathParts(right).slice(0, -1).join('/')
  return leftParent === rightParent
}

function isAspireExtraCertificate(value: string | undefined): value is string {
  if (!value) return false
  const parts = pathParts(value)
  return parts.at(-1) === 'cert.pem' && parts.at(-3)?.startsWith('aspire-') === true
}

function isAspireCertificateDirectory(value: string | undefined, extraCert: string): boolean {
  if (!value) return false
  return pathParts(value).at(-1) === 'certs' && hasSameParent(value, extraCert)
}

function isAspireCertificateFile(value: string | undefined, extraCert: string): boolean {
  if (!value) return false
  return pathParts(value).join('/') === pathParts(extraCert).join('/')
}

/**
 * Keep Aspire's Node CA for local telemetry, but do not let its generated CA
 * replace the operating-system trust store used by the Go-based GitHub CLI.
 */
export function buildGitHubCliEnvironment(
  source: Readonly<Partial<NodeJS.ProcessEnv>>,
  token?: string
): NodeJS.ProcessEnv {
  const result = { ...source } as NodeJS.ProcessEnv
  const extraCert = result.NODE_EXTRA_CA_CERTS
  if (isAspireExtraCertificate(extraCert)) {
    if (isAspireCertificateDirectory(result.SSL_CERT_DIR, extraCert)) {
      delete result.SSL_CERT_DIR
    }
    if (isAspireCertificateFile(result.SSL_CERT_FILE, extraCert)) {
      delete result.SSL_CERT_FILE
    }
  }
  if (token) result.GH_TOKEN = token
  return result
}
