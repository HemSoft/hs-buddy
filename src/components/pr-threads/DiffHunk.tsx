import { parseHunkHeader, trimDiffHunk } from './diffHunkUtils'

interface DiffLineInfo {
  lineClass: string
  leftNum: number | null
  rightNum: number | null
  newOldLine: number
  newNewLine: number
  isRangeHeader: boolean
}

function classifyDiffLine(line: string, oldLine: number, newLine: number): DiffLineInfo {
  if (line.startsWith('@@')) {
    return {
      lineClass: 'diff-line diff-range',
      leftNum: null,
      rightNum: null,
      newOldLine: oldLine,
      newNewLine: newLine,
      isRangeHeader: true,
    }
  }
  if (line.startsWith('+')) {
    return {
      lineClass: 'diff-line diff-add',
      leftNum: null,
      rightNum: newLine,
      newOldLine: oldLine,
      newNewLine: newLine + 1,
      isRangeHeader: false,
    }
  }
  if (line.startsWith('-')) {
    return {
      lineClass: 'diff-line diff-del',
      leftNum: oldLine,
      rightNum: null,
      newOldLine: oldLine + 1,
      newNewLine: newLine,
      isRangeHeader: false,
    }
  }
  return {
    lineClass: 'diff-line',
    leftNum: oldLine,
    rightNum: newLine,
    newOldLine: oldLine + 1,
    newNewLine: newLine + 1,
    isRangeHeader: false,
  }
}

function adjustLineCountersForSkipped(
  skippedLines: string[],
  oldLine: number,
  newLine: number
): { oldLine: number; newLine: number } {
  for (const sl of skippedLines) {
    /* v8 ignore start */
    if (sl.startsWith('+')) newLine++
    else if (sl.startsWith('-')) oldLine++
    /* v8 ignore stop */ else {
      oldLine++
      newLine++
    }
  }
  return { oldLine, newLine }
}

function DiffLineRow({ line, info }: { line: string; info: DiffLineInfo }) {
  if (info.isRangeHeader) {
    return (
      <div className={info.lineClass}>
        <span className="diff-line-num" />
        <span className="diff-line-num" />
        <span className="diff-line-content">{line}</span>
      </div>
    )
  }
  return (
    <div className={info.lineClass}>
      <span className="diff-line-num">{info.leftNum ?? ''}</span>
      <span className="diff-line-num">{info.rightNum ?? ''}</span>
      <span className="diff-line-content">{line}</span>
    </div>
  )
}

function initializeLineCounters(
  lines: string[],
  wasTrimmed: boolean,
  skippedLines: string[]
): { oldLine: number; newLine: number } {
  const headerLine = lines.find(l => l.startsWith('@@'))
  if (!headerLine) return { oldLine: 1, newLine: 1 }
  const parsed = parseHunkHeader(headerLine)
  if (!parsed) return { oldLine: 1, newLine: 1 }
  let { oldStart: oldLine, newStart: newLine } = parsed
  if (wasTrimmed) {
    ;({ oldLine, newLine } = adjustLineCountersForSkipped(skippedLines, oldLine, newLine))
  }
  return { oldLine, newLine }
}

/** Render a diff hunk as styled code lines with line numbers */
export function DiffHunk({ hunk }: { hunk: string }) {
  const { lines, wasTrimmed, skippedLines } = trimDiffHunk(hunk)
  let { oldLine, newLine } = initializeLineCounters(lines, wasTrimmed, skippedLines)
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
          const info = classifyDiffLine(line, oldLine, newLine)
          oldLine = info.newOldLine
          newLine = info.newNewLine

          return <DiffLineRow key={lineKey} line={line} info={info} />
        })}
      </div>
    </div>
  )
}
