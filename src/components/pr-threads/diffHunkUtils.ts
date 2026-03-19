/**
 * Parse the @@ header to extract starting line numbers.
 * Format: @@ -oldStart[,oldCount] +newStart[,newCount] @@
 */
export function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!m) return null
  return { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10) }
}

/**
 * Trim a diff hunk to show only the most relevant lines around the
 * commented position.
 */
export function trimDiffHunk(hunk: string): {
  lines: string[]
  wasTrimmed: boolean
  skipCount: number
  skippedLines: string[]
} {
  const MAX_CONTEXT = 6
  const allLines = hunk.split('\n').filter(l => l.length > 0)

  const headerIdx = allLines.findIndex(l => l.startsWith('@@'))
  const headerLine = headerIdx >= 0 ? allLines[headerIdx] : null
  const contentLines = headerIdx >= 0 ? allLines.slice(headerIdx + 1) : allLines

  if (contentLines.length <= MAX_CONTEXT) {
    return { lines: allLines, wasTrimmed: false, skipCount: 0, skippedLines: [] }
  }

  const skipCount = contentLines.length - MAX_CONTEXT
  const skippedLines = contentLines.slice(0, skipCount)
  const trimmed = contentLines.slice(-MAX_CONTEXT)
  const result = headerLine ? [headerLine, ...trimmed] : trimmed
  return { lines: result, wasTrimmed: true, skipCount, skippedLines }
}
