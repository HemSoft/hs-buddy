import { Fragment, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import type { DiffFile } from '../../api/github'
import { useToggleSet } from '../../hooks/useToggleSet'
import { getDiffLineClass } from '../../utils/diffUtils'
import { formatFileStatus } from '../../utils/githubUrl'

interface ExpandableFileListProps {
  files: DiffFile[]
  /** When this value changes, all expanded files collapse. */
  resetKey: string
}

export function ExpandableFileList({ files, resetKey }: ExpandableFileListProps) {
  const { has: isFileExpanded, toggle: toggleFile, reset: resetExpanded } = useToggleSet()

  const prevResetKey = useRef(resetKey)
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      prevResetKey.current = resetKey
      resetExpanded()
    }
  }, [resetKey, resetExpanded])

  return (
    <div className="repo-commit-files">
      {files.map(file => (
        <div
          key={file.filename}
          className={`repo-detail-card repo-commit-file-card ${isFileExpanded(file.filename) ? 'repo-commit-file-card-expanded' : 'repo-commit-file-card-collapsed'}`}
        >
          <div
            className="repo-commit-file-header repo-commit-file-toggle"
            onClick={() => toggleFile(file.filename)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleFile(file.filename)
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={isFileExpanded(file.filename)}
          >
            <div className="repo-commit-file-header-main">
              <span className="repo-commit-file-chevron">
                {isFileExpanded(file.filename) ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <span className={`repo-commit-file-status repo-commit-file-status-${file.status}`}>
                {formatFileStatus(file.status)}
              </span>
              <h3>{file.filename}</h3>
              {file.previousFilename && (
                <span className="repo-commit-file-previous">from {file.previousFilename}</span>
              )}
            </div>
            <div className="repo-commit-file-header-meta">
              <span className="repo-commit-file-stat repo-commit-file-stat-added">
                +{file.additions}
              </span>
              <span className="repo-commit-file-stat repo-commit-file-stat-removed">
                -{file.deletions}
              </span>
              <span className="repo-commit-file-stat">{file.changes} changes</span>
              {file.blobUrl && (
                <button
                  type="button"
                  className="repo-commit-file-open-btn"
                  onClick={event => {
                    event.stopPropagation()
                    window.shell?.openExternal(file.blobUrl!)
                  }}
                  title="Open file on GitHub"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>

          {isFileExpanded(file.filename) ? (
            file.patch ? (
              <div className="repo-commit-diff" role="presentation">
                {(() => {
                  let charOffset = 0
                  return file.patch.split('\n').map(line => {
                    const key = `${file.filename}-line-${charOffset}-${line.slice(0, 20)}`
                    charOffset += line.length + 1
                    return (
                      <Fragment key={key}>
                        <div className={getDiffLineClass(line)}>{line || ' '}</div>
                      </Fragment>
                    )
                  })
                })()}
              </div>
            ) : (
              <div className="repo-commit-diff-empty">
                GitHub did not provide a patch preview for this file. This usually means the file is
                binary, too large, or the change is a pure rename.
              </div>
            )
          ) : null}
        </div>
      ))}
    </div>
  )
}
