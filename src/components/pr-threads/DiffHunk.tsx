import { parseHunkHeader, trimDiffHunk } from './diffHunkUtils'

/** Render a diff hunk as styled code lines with line numbers */
export function DiffHunk({ hunk }: { hunk: string }) {
  const { lines, wasTrimmed, skippedLines } = trimDiffHunk(hunk)

  const headerLine = lines.find(l => l.startsWith('@@'))
  const parsed = headerLine ? parseHunkHeader(headerLine) : null
  let oldLine = parsed?.oldStart ?? 1
  let newLine = parsed?.newStart ?? 1

  if (wasTrimmed && parsed) {
    for (const sl of skippedLines) {
      /* v8 ignore start */
      if (sl.startsWith('+')) newLine++
      else if (sl.startsWith('-')) oldLine++
      /* v8 ignore stop */ else {
        oldLine++
        newLine++
      }
    }
  }

  let charOffset = 0

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
        {lines.map(line => {
          const lineKey = `diff-line-${charOffset}-${line.slice(0, 40)}`
          charOffset += line.length + 1
          let lineClass = 'diff-line'
          let leftNum: number | null = null
          let rightNum: number | null = null

          if (line.startsWith('@@')) {
            lineClass += ' diff-range'
            return (
              <div key={lineKey} className={lineClass}>
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
            <div key={lineKey} className={lineClass}>
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
