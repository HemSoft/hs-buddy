export function parseCommentBody(
  body: string | null | undefined
): Array<{ type: 'text' | 'suggestion'; content: string }> {
  const segments: Array<{ type: 'text' | 'suggestion'; content: string }> = []
  const safeBody = body ?? ''
  const regex = /```suggestion\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(safeBody)) !== null) {
    if (match.index > lastIndex) {
      const text = safeBody.slice(lastIndex, match.index).trim()
      if (text) segments.push({ type: 'text', content: text })
    }
    segments.push({ type: 'suggestion', content: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < safeBody.length) {
    const text = safeBody.slice(lastIndex).trim()
    if (text) segments.push({ type: 'text', content: text })
  }

  /* v8 ignore start -- defensive fallback; unreachable because lines 19-20 always capture non-empty text */
  if (segments.length === 0 && safeBody.trim()) {
    segments.push({ type: 'text', content: safeBody })
  }
  /* v8 ignore stop */

  return segments
}
