type CommentSegment = { type: 'text' | 'suggestion'; content: string }

/** Push a trimmed text segment if non-empty. */
function addTextSegment(segments: CommentSegment[], raw: string): void {
  const trimmed = raw.trim()
  if (trimmed) segments.push({ type: 'text', content: trimmed })
}

function normalizeCommentBody(body: string | null | undefined): string {
  return body ?? ''
}

function addCommentFallback(segments: CommentSegment[], safeBody: string): void {
  /* v8 ignore start -- defensive fallback; unreachable because addTextSegment always captures non-empty text */
  if (segments.length === 0 && safeBody.trim()) {
    segments.push({ type: 'text', content: safeBody })
  }
  /* v8 ignore stop */
}

export function parseCommentBody(body: string | null | undefined): CommentSegment[] {
  const segments: CommentSegment[] = []
  const safeBody = normalizeCommentBody(body)
  const regex = /```suggestion\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(safeBody)) !== null) {
    if (match.index > lastIndex) addTextSegment(segments, safeBody.slice(lastIndex, match.index))
    segments.push({ type: 'suggestion', content: match[1] })
    lastIndex = match.index + match[0].length
  }

  addTextSegment(segments, safeBody.slice(lastIndex))
  addCommentFallback(segments, safeBody)

  return segments
}
