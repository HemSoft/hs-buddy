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

function FileChevron({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
}

function PreviousFilenameLabel({ previousFilename }: { previousFilename: string | null }) {
  if (!previousFilename) {
    return null
  }

  return <span className="repo-commit-file-previous">from {previousFilename}</span>
}

function OpenBlobButton({ blobUrl }: { blobUrl: string | null }) {
  if (!blobUrl) {
    return null
  }

  return (
    <button
      type="button"
      className="repo-commit-file-open-btn"
      onClick={event => {
        event.stopPropagation()
        window.shell?.openExternal(blobUrl)
      }}
      title="Open file on GitHub"
    >
      <ExternalLink size={14} />
    </button>
  )
}

function DiffPatchView({ file }: { file: DiffFile }) {
  if (!file.patch) {
    return (
      <div className="repo-commit-diff-empty">
        GitHub did not provide a patch preview for this file. This usually means the file is binary,
        too large, or the change is a pure rename.
      </div>
    )
  }

  let charOffset = 0
  return (
    <div className="repo-commit-diff" role="presentation">
      {file.patch.split('\n').map(line => {
        const key = `${file.filename}-line-${charOffset}-${line.slice(0, 20)}`
        charOffset += line.length + 1
        return (
          <Fragment key={key}>
            <div className={getDiffLineClass(line)}>{line || ' '}</div>
          </Fragment>
        )
      })}
    </div>
  )
}

function ExpandableFileCard({
  file,
  isExpanded,
  toggleFile,
}: {
  file: DiffFile
  isExpanded: boolean
  toggleFile: (key: string) => void
}) {
  return (
    <div
      className={`repo-detail-card repo-commit-file-card ${isExpanded ? 'repo-commit-file-card-expanded' : 'repo-commit-file-card-collapsed'}`}
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
        aria-expanded={isExpanded}
      >
        <div className="repo-commit-file-header-main">
          <span className="repo-commit-file-chevron">
            <FileChevron isExpanded={isExpanded} />
          </span>
          <span className={`repo-commit-file-status repo-commit-file-status-${file.status}`}>
            {formatFileStatus(file.status)}
          </span>
          <h3>{file.filename}</h3>
          <PreviousFilenameLabel previousFilename={file.previousFilename} />
        </div>
        <div className="repo-commit-file-header-meta">
          <span className="repo-commit-file-stat repo-commit-file-stat-added">
            +{file.additions}
          </span>
          <span className="repo-commit-file-stat repo-commit-file-stat-removed">
            -{file.deletions}
          </span>
          <span className="repo-commit-file-stat">{file.changes} changes</span>
          <OpenBlobButton blobUrl={file.blobUrl} />
        </div>
      </div>

      {isExpanded ? <DiffPatchView file={file} /> : null}
    </div>
  )
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
        <ExpandableFileCard
          key={file.filename}
          file={file}
          isExpanded={isFileExpanded(file.filename)}
          toggleFile={toggleFile}
        />
      ))}
    </div>
  )
}
