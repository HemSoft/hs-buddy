import { useMemo } from 'react'
import { GitBranch, FolderGit2 } from 'lucide-react'
import { useRepoBookmarks } from '../../hooks/useConvex'
import { InlineDropdown } from '../InlineDropdown'
import type { DropdownOption } from '../InlineDropdown'
import './RepoPicker.css'

export interface RepoPickerProps {
  /** Currently selected repo value as "owner/repo" (empty = none) */
  value: string
  /** Called when repo changes */
  onChange: (value: string) => void
  /** Disable the picker */
  disabled?: boolean
  /** Tooltip on hover */
  title?: string
  /** Additional CSS class */
  className?: string
  /** Render variant */
  variant?: 'inline' | 'select'
  /** Menu alignment for inline */
  align?: 'left' | 'right'
  /** Placeholder text */
  placeholder?: string
  /** Whether to include a "None" option */
  allowNone?: boolean
}

/**
 * Reusable repo picker from bookmarked repositories.
 * Uses the Convex repoBookmarks table as the data source.
 * Supports two display variants:
 * - `inline` (default): compact InlineDropdown style
 * - `select`: standard <select> element
 */
export function RepoPicker({
  value,
  onChange,
  disabled = false,
  title = 'Target repository',
  className = '',
  variant = 'inline',
  align = 'left',
  placeholder = 'No repo',
  allowNone = true,
}: RepoPickerProps) {
  const bookmarks = useRepoBookmarks()

  // Group bookmarks by folder, sort repos within each
  const { options, selectGroups } = useMemo(() => {
    if (!bookmarks || bookmarks.length === 0) {
      return { options: [] as DropdownOption[], selectGroups: [] as { folder: string; repos: typeof bookmarks }[] }
    }

    const sorted = [...bookmarks].sort((a, b) => {
      if (a.folder !== b.folder) return a.folder.localeCompare(b.folder)
      return `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`)
    })

    // Build flat options for InlineDropdown
    const opts: DropdownOption[] = []
    if (allowNone) {
      opts.push({ value: '', label: placeholder })
    }

    // Group for select
    const groups: { folder: string; repos: typeof bookmarks }[] = []
    let currentFolder = ''
    let currentGroup: typeof bookmarks = []

    for (const bm of sorted) {
      if (bm.folder !== currentFolder) {
        if (currentGroup.length > 0) {
          groups.push({ folder: currentFolder, repos: currentGroup })
        }
        currentFolder = bm.folder
        currentGroup = []
      }
      currentGroup.push(bm)
      const repoKey = `${bm.owner}/${bm.repo}`
      opts.push({
        value: repoKey,
        label: repoKey,
        hint: bm.folder,
      })
    }
    if (currentGroup.length > 0) {
      groups.push({ folder: currentFolder, repos: currentGroup })
    }

    return { options: opts, selectGroups: groups }
  }, [bookmarks, allowNone, placeholder])

  const loading = bookmarks === undefined

  if (variant === 'select') {
    return (
      <div className={`select-control ${className}`}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="settings-select"
          disabled={disabled || loading}
        >
          {allowNone && <option value="">{placeholder}</option>}
          {selectGroups.map(group => (
            <optgroup key={group.folder} label={group.folder}>
              {(group.repos ?? []).map(bm => {
                const repoKey = `${bm.owner}/${bm.repo}`
                return (
                  <option key={repoKey} value={repoKey}>
                    {repoKey}
                  </option>
                )
              })}
            </optgroup>
          ))}
        </select>
        {!loading && bookmarks && bookmarks.length === 0 && (
          <p className="hint" style={{ marginTop: '4px' }}>
            No bookmarked repos. Add repos from the Repos view.
          </p>
        )}
      </div>
    )
  }

  // Inline variant
  if (loading) {
    return (
      <span className={`repo-picker-loading ${className}`}>
        <FolderGit2 size={11} /> Loading...
      </span>
    )
  }

  return (
    <InlineDropdown
      value={value}
      options={options}
      onChange={onChange}
      icon={<GitBranch size={11} />}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      className={className}
      align={align}
    />
  )
}
