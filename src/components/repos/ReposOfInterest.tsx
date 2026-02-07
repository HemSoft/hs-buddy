import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  BookmarkPlus,
  ExternalLink,
  Pencil,
  Trash2,
  GripVertical,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useRepoBookmarks, useRepoFolders, useRepoFolderMutations, useRepoBookmarkMutations } from '../../hooks/useConvex'
import { Id } from '../../../convex/_generated/dataModel'
import { AddRepoModal } from './AddRepoModal'
import './ReposOfInterest.css'

const CONVEX_TIMEOUT_MS = 8_000 // 8 seconds before showing connection error

export function ReposOfInterest() {
  const bookmarks = useRepoBookmarks()
  const folders = useRepoFolders()
  const { create: createFolder, rename: renameFolder, remove: removeFolder } = useRepoFolderMutations()
  const { remove: removeBookmark, update: updateBookmark } = useRepoBookmarkMutations()

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'folder' | 'repo' | 'root'
    folderId?: Id<"repoFolders">
    folderName?: string
    bookmarkId?: Id<"repoBookmarks">
  } | null>(null)
  const [showAddRepo, setShowAddRepo] = useState<string | null>(null) // folder name to add to
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolder, setRenamingFolder] = useState<{ id: Id<"repoFolders">; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleFolder = useCallback((folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) {
        next.delete(folderName)
      } else {
        next.add(folderName)
      }
      return next
    })
  }, [])

  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    type: 'folder' | 'repo' | 'root',
    folderId?: Id<"repoFolders">,
    folderName?: string,
    bookmarkId?: Id<"repoBookmarks">,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, type, folderId, folderName, bookmarkId })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return
    setError(null)
    try {
      await createFolder({ name: newFolderName.trim() })
      setNewFolderName('')
      setShowNewFolder(false)
      // Auto-expand the new folder
      setExpandedFolders(prev => new Set([...prev, newFolderName.trim()]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }, [newFolderName, createFolder])

  const handleRenameFolder = useCallback(async () => {
    if (!renamingFolder || !renamingFolder.name.trim()) return
    setError(null)
    try {
      await renameFolder({ id: renamingFolder.id, name: renamingFolder.name.trim() })
      setRenamingFolder(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder')
    }
  }, [renamingFolder, renameFolder])

  const handleDeleteFolder = useCallback(async (folderId: Id<"repoFolders">) => {
    setError(null)
    try {
      await removeFolder({ id: folderId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder')
    }
  }, [removeFolder])

  const handleDeleteBookmark = useCallback(async (bookmarkId: Id<"repoBookmarks">) => {
    setError(null)
    try {
      await removeBookmark({ id: bookmarkId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark')
    }
  }, [removeBookmark])

  const handleMoveBookmark = useCallback(async (bookmarkId: Id<"repoBookmarks">, newFolder: string) => {
    setError(null)
    try {
      await updateBookmark({ id: bookmarkId, folder: newFolder })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move bookmark')
    }
  }, [updateBookmark])

  const openInBrowser = useCallback((url: string) => {
    window.shell.openExternal(url)
  }, [])

  // Group bookmarks by folder
  const bookmarksByFolder = (bookmarks ?? []).reduce<Record<string, typeof bookmarks>>((acc, bm) => {
    if (!acc[bm.folder]) acc[bm.folder] = []
    acc[bm.folder]!.push(bm)
    return acc
  }, {} as Record<string, NonNullable<typeof bookmarks>>)

  const loading = bookmarks === undefined || folders === undefined

  // Connection timeout — if still loading after CONVEX_TIMEOUT_MS, something's wrong
  const [timedOut, setTimedOut] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loading && !timedOut) {
      timeoutRef.current = setTimeout(() => setTimedOut(true), CONVEX_TIMEOUT_MS)
      return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
    }
    if (!loading && timedOut) {
      setTimedOut(false) // connection recovered
    }
  }, [loading, timedOut])

  return (
    <div className="repos-of-interest">
      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={closeContextMenu} />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            {contextMenu.type === 'root' && (
              <>
                <button onClick={() => { setShowNewFolder(true); closeContextMenu() }}>
                  <FolderPlus size={14} />
                  New Folder
                </button>
              </>
            )}
            {contextMenu.type === 'folder' && (
              <>
                <button onClick={() => {
                  setShowAddRepo(contextMenu.folderName ?? null)
                  closeContextMenu()
                }}>
                  <BookmarkPlus size={14} />
                  Add Repo
                </button>
                <button onClick={() => {
                  if (contextMenu.folderId && contextMenu.folderName) {
                    setRenamingFolder({ id: contextMenu.folderId, name: contextMenu.folderName })
                  }
                  closeContextMenu()
                }}>
                  <Pencil size={14} />
                  Rename Folder
                </button>
                <div className="context-menu-separator" />
                <button className="context-menu-danger" onClick={() => {
                  if (contextMenu.folderId) handleDeleteFolder(contextMenu.folderId)
                  closeContextMenu()
                }}>
                  <Trash2 size={14} />
                  Delete Folder
                </button>
              </>
            )}
            {contextMenu.type === 'repo' && (
              <>
                {folders && folders.length > 1 && contextMenu.bookmarkId && (
                  <>
                    {folders
                      .filter(f => f.name !== contextMenu.folderName)
                      .map(f => (
                        <button key={f._id} onClick={() => {
                          if (contextMenu.bookmarkId) handleMoveBookmark(contextMenu.bookmarkId, f.name)
                          closeContextMenu()
                        }}>
                          <GripVertical size={14} />
                          Move to {f.name}
                        </button>
                      ))}
                    <div className="context-menu-separator" />
                  </>
                )}
                <button className="context-menu-danger" onClick={() => {
                  if (contextMenu.bookmarkId) handleDeleteBookmark(contextMenu.bookmarkId)
                  closeContextMenu()
                }}>
                  <Trash2 size={14} />
                  Remove Repo
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Header */}
      <div className="repos-header">
        <h3>Repos of Interest</h3>
        <div className="repos-header-actions">
          <button
            className="repos-header-btn"
            onClick={() => setShowNewFolder(true)}
            title="New Folder"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="repos-error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {/* New Folder Input */}
      {showNewFolder && (
        <div className="repos-inline-input">
          <FolderPlus size={14} />
          <input
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
            }}
            autoFocus
          />
          <button className="repos-inline-btn" onClick={handleCreateFolder}>Add</button>
          <button className="repos-inline-btn secondary" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>
            Cancel
          </button>
        </div>
      )}

      {/* Content */}
      <div
        className="repos-content"
        onContextMenu={(e) => handleContextMenu(e, 'root')}
      >
        {loading ? (
          timedOut ? (
            <div className="repos-empty">
              <AlertTriangle size={32} strokeWidth={1} />
              <p>Cannot connect to Convex</p>
              <p className="repos-empty-hint">
                Make sure <code>./runServer.ps1</code> is running in a separate terminal
              </p>
              <button
                className="repos-retry-btn"
                onClick={() => { setTimedOut(false) }}
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : (
            <div className="repos-loading">Loading...</div>
          )
        ) : folders.length === 0 ? (
          <div className="repos-empty">
            <FolderPlus size={32} strokeWidth={1} />
            <p>No folders yet</p>
            <p className="repos-empty-hint">Right-click or click + to create a folder</p>
          </div>
        ) : (
          folders.map(folder => {
            const isExpanded = expandedFolders.has(folder.name)
            const folderBookmarks = bookmarksByFolder[folder.name] ?? []

            return (
              <div key={folder._id} className="repos-folder">
                <div
                  className="repos-folder-header"
                  onClick={() => toggleFolder(folder.name)}
                  onContextMenu={(e) => handleContextMenu(e, 'folder', folder._id, folder.name)}
                >
                  <span className="repos-folder-chevron">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="repos-folder-icon">
                    {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                  </span>

                  {renamingFolder?.id === folder._id ? (
                    <input
                      className="repos-rename-input"
                      type="text"
                      value={renamingFolder.name}
                      onChange={e => setRenamingFolder({ ...renamingFolder, name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameFolder()
                        if (e.key === 'Escape') setRenamingFolder(null)
                      }}
                      onBlur={handleRenameFolder}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className="repos-folder-name">{folder.name}</span>
                  )}

                  <span className="repos-folder-count">{folderBookmarks.length}</span>

                  <button
                    className="repos-folder-add"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowAddRepo(folder.name)
                    }}
                    title="Add repo"
                  >
                    <BookmarkPlus size={14} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="repos-folder-items">
                    {folderBookmarks.length === 0 ? (
                      <div className="repos-folder-empty">
                        No repos — click + to add one
                      </div>
                    ) : (
                      folderBookmarks.map(bm => (
                        <div
                          key={bm._id}
                          className="repos-repo-item"
                          onClick={() => openInBrowser(bm.url)}
                          onContextMenu={(e) => handleContextMenu(e, 'repo', folder._id, folder.name, bm._id)}
                          title={bm.description || `${bm.owner}/${bm.repo}`}
                        >
                          <ExternalLink size={14} className="repos-repo-icon" />
                          <span className="repos-repo-owner">{bm.owner}/</span>
                          <span className="repos-repo-name">{bm.repo}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add Repo Modal */}
      {showAddRepo && (
        <AddRepoModal
          folder={showAddRepo}
          folders={folders ?? []}
          onClose={() => setShowAddRepo(null)}
        />
      )}
    </div>
  )
}
