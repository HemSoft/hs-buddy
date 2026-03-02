export function parseOwnerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(?:\d+)/)
  if (!match || !match[1] || !match[2]) return null
  return { owner: match[1], repo: match[2] }
}
