/** Metadata shape passed from PR list/tree context actions */
export interface PRReviewInfo {
  prUrl: string
  prTitle: string
  prNumber: number
  repo: string
  org: string
  author: string
  initialPrompt?: string
}

export function parsePRReviewInfo(viewId: string): PRReviewInfo | null {
  const prefix = 'pr-review:'
  if (!viewId.startsWith(prefix)) {
    return null
  }

  try {
    const encoded = viewId.replace(prefix, '')
    if (!encoded) {
      return null
    }

    return JSON.parse(decodeURIComponent(encoded)) as PRReviewInfo
  } catch {
    return null
  }
}
