import { useState, useCallback } from 'react'
import { X, BookmarkPlus, AlertCircle, Link2 } from 'lucide-react'
import { useRepoBookmarkMutations } from '../../hooks/useConvex'
import './ReposOfInterest.css'

interface AddRepoModalProps {
  folder: string
  folders: Array<{ _id: string; name: string }>
  onClose: () => void
}

/**
 * Parse a GitHub URL into owner/repo
 * Handles:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/main
 *   github.com/owner/repo
 *   owner/repo
 */
function parseRepoUrl(input: string): { owner: string; repo: string; url: string } | null {
  const trimmed = input.trim()

  // Try parsing as URL
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s.]+)/
  )
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      url: `https://github.com/${urlMatch[1]}/${urlMatch[2]}`,
    }
  }

  // Try owner/repo format
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      url: `https://github.com/${shortMatch[1]}/${shortMatch[2]}`,
    }
  }

  return null
}

export function AddRepoModal({ folder, folders, onClose }: AddRepoModalProps) {
  const { create } = useRepoBookmarkMutations()
  const [url, setUrl] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(folder)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = url ? parseRepoUrl(url) : null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleSave = useCallback(async () => {
    if (!parsed) {
      setError('Please enter a valid GitHub URL or owner/repo')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await create({
        folder: selectedFolder,
        owner: parsed.owner,
        repo: parsed.repo,
        url: parsed.url,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repo')
    } finally {
      setSaving(false)
    }
  }, [parsed, selectedFolder, description, create, onClose])

  return (
    <div className="add-repo-overlay" onClick={handleOverlayClick}>
      <div className="add-repo-modal">
        <div className="add-repo-header">
          <div className="add-repo-title">
            <BookmarkPlus size={20} />
            <h2>Add Repository</h2>
          </div>
          <button className="btn-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="add-repo-content">
          {error && (
            <div className="add-repo-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="repo-url">Repository URL</label>
            <div className="input-with-icon">
              <Link2 size={16} className="input-icon" />
              <input
                id="repo-url"
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo or owner/repo"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && parsed) handleSave()
                }}
              />
            </div>
            {url && parsed && (
              <div className="form-hint form-hint-success">
                {parsed.owner}/{parsed.repo}
              </div>
            )}
            {url && !parsed && (
              <div className="form-hint form-hint-error">
                Could not parse repository URL
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="repo-folder">Folder</label>
            <select
              id="repo-folder"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
            >
              {folders.map(f => (
                <option key={f._id} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="repo-description">Description (optional)</label>
            <input
              id="repo-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the repo"
            />
          </div>
        </div>

        <div className="add-repo-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !parsed}
          >
            <BookmarkPlus size={16} />
            {saving ? 'Adding...' : 'Add Repo'}
          </button>
        </div>
      </div>
    </div>
  )
}
