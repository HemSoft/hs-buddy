/**
 * Parse the @@ header to extract starting line numbers.
 * Format: @@ -oldStart[,oldCount] +newStart[,newCount] @@
 */
function parseHunkHeader(header: string): { oldStart: number; newStart: number } | null {
  const m = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!m) return null
  return { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10) }
}

/**
 * Trim a diff hunk to show only the most relevant lines around the
 * commented position.
 */
function trimDiffHunk(hunk: string): { lines: string[]; wasTrimmed: boolean; skipCount: number } {
  const MAX_CONTEXT = 6
  const allLines = hunk.split('\n').filter(l => l.length > 0)

  const headerIdx = allLines.findIndex(l => l.startsWith('@@'))
  const headerLine = headerIdx >= 0 ? allLines[headerIdx] : null
  const contentLines = headerIdx >= 0 ? allLines.slice(headerIdx + 1) : allLines

  if (contentLines.length <= MAX_CONTEXT) {
    return { lines: allLines, wasTrimmed: false, skipCount: 0 }
  }

  const skipCount = contentLines.length - MAX_CONTEXT
  const trimmed = contentLines.slice(-MAX_CONTEXT)
  const result = headerLine ? [headerLine, ...trimmed] : trimmed
  return { lines: result, wasTrimmed: true, skipCount }
}

/** Render a diff hunk as styled code lines with line numbers */
export function DiffHunk({ hunk }: { hunk: string }) {
  const { lines, wasTrimmed, skipCount } = trimDiffHunk(hunk)

  const headerLine = lines.find(l => l.startsWith('@@'))
  const parsed = headerLine ? parseHunkHeader(headerLine) : null
  let oldLine = parsed?.oldStart ?? 1
  let newLine = parsed?.newStart ?? 1

  if (wasTrimmed && parsed) {
    const allContentLines = hunk.split('\n').filter(l => l.length > 0)
    const headerIdx = allContentLines.findIndex(l => l.startsWith('@@'))
    const skippedLines = allContentLines.slice(headerIdx + 1, headerIdx + 1 + skipCount)
    for (const sl of skippedLines) {
      if (sl.startsWith('+')) newLine++
      else if (sl.startsWith('-')) oldLine++
      else {
        oldLine++
        newLine++
      }
    }
  }

  return (
    <div className="diff-hunk">
      <div className="diff-hunk-lines">
        {wasTrimmed && (
          <div className="diff-line diff-truncated">
            <span className="diff-line-num" />
            <span className="diff-line-num" />
            <span className="diff-line-content">⋯</span>
          </div>
        )}
        {lines.map((line, i) => {
          let lineClass = 'diff-line'
          let leftNum: number | null = null
          let rightNum: number | null = null

          if (line.startsWith('@@')) {
            lineClass += ' diff-range'
            return (
              <div key={`hunk-header-${line}`} className={lineClass}>
                <span className="diff-line-num" />
                <span className="diff-line-num" />
                <span className="diff-line-content">{line}</span>
              </div>
            )
          } else if (line.startsWith('+')) {
            lineClass += ' diff-add'
            rightNum = newLine++
          } else if (line.startsWith('-')) {
            lineClass += ' diff-del'
            leftNum = oldLine++
          } else {
            leftNum = oldLine++
            rightNum = newLine++
          }

          return (
            <div key={`${leftNum ?? 'n'}-${rightNum ?? 'n'}-${i}`} className={lineClass}>
              <span className="diff-line-num">{leftNum ?? ''}</span>
              <span className="diff-line-num">{rightNum ?? ''}</span>
              <span className="diff-line-content">{line}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
