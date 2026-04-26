const SSRF_BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const PRIVATE_IPV4_PREFIXES = ['10.', '192.168.', '169.254.']

const INTERNAL_PREFIXES = ['127.', '169.254.', '10.', '192.168.']
const INTERNAL_SUFFIXES = ['.local', '.internal']
const INTERNAL_PATTERN = /^172\.(1[6-9]|2\d|3[01])\./

/** Check whether an IPv6 address is a private/reserved address. */
export function isPrivateIPv6(lower: string): boolean {
  return (
    lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
  )
}

export function isPrivateIP(ip: string): boolean {
  // Strip IPv4-mapped IPv6 prefix
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip

  // IPv4 checks
  if (normalized.includes('.')) {
    if (normalized.startsWith('127.') || normalized === '0.0.0.0') return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true
    return PRIVATE_IPV4_PREFIXES.some(p => normalized.startsWith(p))
  }

  // IPv6: loopback (::1), link-local (fe80::), ULA (fc00::/7)
  return isPrivateIPv6(normalized.toLowerCase())
}

export function isInternalHostname(hostname: string): boolean {
  if (SSRF_BLOCKED_HOSTNAMES.has(hostname)) return true
  if (INTERNAL_PREFIXES.some(p => hostname.startsWith(p))) return true
  if (INTERNAL_SUFFIXES.some(s => hostname.endsWith(s))) return true
  return INTERNAL_PATTERN.test(hostname)
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]+?)<\/title>/i)
  return match?.[1]?.trim()?.replace(/\s+/g, ' ') ?? null
}

export function extractOgTitle(html: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  return match?.[1]?.trim() ?? null
}

export function extractPageTitle(html: string): string | null {
  const title = extractTitleTag(html)
  if (title) return decodeHtmlEntities(title)
  const ogTitle = extractOgTitle(html)
  if (ogTitle) return decodeHtmlEntities(ogTitle)
  return null
}

/** Validate a URL string: must be http/https and not an internal hostname. */
export function validateUrl(url: string): URL {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs supported')
  }
  if (isInternalHostname(parsed.hostname.toLowerCase())) {
    throw new Error('Internal URLs not allowed')
  }
  return parsed
}
