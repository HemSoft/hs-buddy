import { ChevronDown, ChevronRight, FolderGit2, Plus, Trash2, Circle } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import type { CrewProject, CrewSession } from '../../types/crew'

interface CrewSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

export function CrewSidebar({ onItemSelect, selectedItem }: CrewSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['crew-projects']))
  const [projects, setProjects] = useState<CrewProject[]>([])
  const [sessions, setSessions] = useState<Record<string, CrewSession | null>>({})
  const [addProjectError, setAddProjectError] = useState<string | null>(null)
  const [isAddingProject, setIsAddingProject] = useState(false)

  const loadProjects = useCallback(async () => {
    const list: CrewProject[] = await window.crew.listProjects()
    const sortedProjects = [...list].sort((left, right) => {
      const displayNameCompare = left.displayName.localeCompare(right.displayName, undefined, {
        sensitivity: 'base',
      })
      if (displayNameCompare !== 0) {
        return displayNameCompare
      }

      return left.githubSlug.localeCompare(right.githubSlug, undefined, {
        sensitivity: 'base',
      })
    })

    setProjects(sortedProjects)
    const sessionMap: Record<string, CrewSession | null> = {}
    for (const p of sortedProjects) {
      sessionMap[p.id] = await window.crew.getSession(p.id)
    }
    setSessions(sessionMap)
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleAddProject = async () => {
    if (isAddingProject) return

    setAddProjectError(null)
    setIsAddingProject(true)

    try {
      const result = await window.crew.addProject()
      if (result.success) {
        await loadProjects()
        if (result.project) {
          onItemSelect(`crew-project:${result.project.id}`)
        }
        return
      }

      if (result.error && result.error !== 'Cancelled') {
        setAddProjectError(result.error)
      }
    } catch (error) {
      setAddProjectError(error instanceof Error ? error.message : 'Failed to add project.')
    } finally {
      setIsAddingProject(false)
    }
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    await window.crew.removeProject(projectId)
    await loadProjects()
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>THE CREW</h2>
        <button
          className="sidebar-header-action"
          onClick={handleAddProject}
          disabled={isAddingProject}
          title="Add Project"
          style={{
            background: 'none',
            border: 'none',
            cursor: isAddingProject ? 'wait' : 'pointer',
            color: 'inherit',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            opacity: isAddingProject ? 0.6 : 1,
          }}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="sidebar-panel-content">
        <div className="sidebar-section">
          <div
            className="sidebar-section-header"
            role="button"
            tabIndex={0}
            onClick={() => toggleSection('crew-projects')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleSection('crew-projects')
              }
            }}
          >
            <div className="sidebar-section-title">
              {expandedSections.has('crew-projects') ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="sidebar-section-icon">
                <FolderGit2 size={16} />
              </span>
              <span>Projects</span>
              {projects.length > 0 && <span className="sidebar-item-count">{projects.length}</span>}
            </div>
          </div>
          {expandedSections.has('crew-projects') && (
            <div className="sidebar-section-items">
              {addProjectError && (
                <div
                  className="sidebar-item sidebar-item-empty"
                  role="alert"
                  style={{ color: '#e85d5d', whiteSpace: 'normal' }}
                >
                  <span className="sidebar-item-label">{addProjectError}</span>
                </div>
              )}
              {projects.length === 0 ? (
                <div className="sidebar-item sidebar-item-empty">
                  <span className="sidebar-item-label">No projects yet</span>
                </div>
              ) : (
                projects.map(project => {
                  const viewId = `crew-project:${project.id}`
                  const session = sessions[project.id]
                  const isActive = session?.status === 'active'
                  return (
                    <div
                      key={project.id}
                      className={`sidebar-item ${selectedItem === viewId ? 'selected' : ''}`}
                      onClick={() => onItemSelect(viewId)}
                      title={`${project.githubSlug}\n${project.localPath}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemSelect(viewId); } }}
                    >
                      <span className="sidebar-item-icon">
                        {isActive ? (
                          <Circle size={10} fill="#4ec9b0" stroke="#4ec9b0" />
                        ) : (
                          <FolderGit2 size={14} />
                        )}
                      </span>
                      <span className="sidebar-item-label">{project.displayName}</span>
                      <button
                        className="sidebar-item-action"
                        onClick={e => handleRemoveProject(e, project.id)}
                        title="Remove project"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'inherit',
                          padding: '2px',
                          opacity: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })
              )}
              <div
                className="sidebar-item"
                onClick={handleAddProject}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAddProject(); } }}
                style={{
                  opacity: isAddingProject ? 0.45 : 0.7,
                  pointerEvents: isAddingProject ? 'none' : 'auto',
                }}
              >
                <span className="sidebar-item-icon">
                  <Plus size={14} />
                </span>
                <span className="sidebar-item-label">
                  {isAddingProject ? 'Opening folder picker…' : 'Add Project…'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
