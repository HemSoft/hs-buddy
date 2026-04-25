import { useMemo } from 'react'
import { GitBranch, FolderGit2 } from 'lucide-react'
import { useRepoBookmarks } from '../../hooks/useConvex'
import { InlineDropdown, type DropdownOption } from '../InlineDropdown'
import './RepoPicker.css'

interface RepoPickerProps {
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
  /** id for the select element (select variant only) */
  id?: string
}

/**
 * Reusable repo picker from bookmarked repositories.
 * Uses the Convex repoBookmarks table as the data source.
 * Supports two display variants:
 * - `inline` (default): compact InlineDropdown style
 * - `select`: standard <select> element
 */
type RepoBookmarkList = NonNullable<ReturnType<typeof useRepoBookmarks>>

function buildRepoOptions(
  bookmarks: ReturnType<typeof useRepoBookmarks>,
  allowNone: boolean,
  placeholder: string
): { options: DropdownOption[]; selectGroups: { folder: string; repos: RepoBookmarkList }[] } {
  if (!bookmarks || bookmarks.length === 0) {
    return { options: [], selectGroups: [] }
  }

  const sorted = [...bookmarks].sort((a, b) => {
    if (a.folder !== b.folder) return a.folder.localeCompare(b.folder)
    return `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`)
  })

  const opts: DropdownOption[] = []
  if (allowNone) {
    opts.push({ value: '', label: placeholder })
  }

  const groups: { folder: string; repos: RepoBookmarkList }[] = []
  let currentFolder = ''
  let currentGroup: RepoBookmarkList = []

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
  /* v8 ignore start */
  if (currentGroup.length > 0) {
    /* v8 ignore stop */
    groups.push({ folder: currentFolder, repos: currentGroup })
  }

  return { options: opts, selectGroups: groups }
}

function SelectVariant({
  id,
  value,
  onChange,
  disabled,
  loading,
  allowNone,
  placeholder,
  selectGroups,
  bookmarks,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  loading: boolean
  allowNone: boolean
  placeholder: string
  selectGroups: { folder: string; repos: RepoBookmarkList }[]
  bookmarks: ReturnType<typeof useRepoBookmarks>
  className: string
}) {
  return (
    <div className={`select-control ${className}`}>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="settings-select"
        disabled={disabled || loading}
      >
        {allowNone && <option value="">{placeholder}</option>}
        {selectGroups.map(group => (
          <optgroup key={group.folder} label={group.folder}>
            {/* v8 ignore start */}
            {(group.repos ?? []).map(bm => {
              const repoKey = `${bm.owner}/${bm.repo}`
              return (
                <option key={repoKey} value={repoKey}>
                  {repoKey}
                </option>
              )
            })}
            {/* v8 ignore stop */}
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

const REPO_PICKER_DEFAULTS = {
  disabled: false,
  title: 'Target repository',
  className: '',
  variant: 'inline' as const,
  align: 'left' as const,
  placeholder: 'No repo',
  allowNone: true,
}

export function RepoPicker(rawProps: RepoPickerProps) {
  const {
    value,
    onChange,
    disabled,
    title,
    className,
    variant,
    align,
    placeholder,
    allowNone,
    id,
  } = { ...REPO_PICKER_DEFAULTS, ...rawProps }
  const bookmarks = useRepoBookmarks()

  const { options, selectGroups } = useMemo(
    () => buildRepoOptions(bookmarks, allowNone, placeholder),
    [bookmarks, allowNone, placeholder]
  )

  const loading = bookmarks === undefined

  if (variant === 'select') {
    return (
      <SelectVariant
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        loading={loading}
        allowNone={allowNone}
        placeholder={placeholder}
        selectGroups={selectGroups}
        bookmarks={bookmarks}
        className={className}
      />
    )
  }

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
