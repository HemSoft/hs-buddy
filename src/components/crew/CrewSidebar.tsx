import { ChevronDown, ChevronRight, FolderGit2, Plus, Trash2, Circle } from 'lucide-react'
import { useEffect, useCallback, useReducer } from 'react'
import type { CrewProject, CrewSession } from '../../types/crew'
import './Crew.css'

interface CrewSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
}

interface CrewSidebarState {
  expandedSections: Set<string>
  projects: CrewProject[]
  sessions: Record<string, CrewSession | null>
  addProjectError: string | null
  isAddingProject: boolean
}

type CrewSidebarAction =
  | {
      type: 'SET_PROJECTS'
      payload: {
        projects: CrewProject[]
        sessions: Record<string, CrewSession | null>
      }
    }
  | { type: 'TOGGLE_SECTION'; sectionId: string }
  | { type: 'START_ADDING_PROJECT' }
  | { type: 'FINISH_ADDING_PROJECT' }
  | { type: 'SET_ADD_PROJECT_ERROR'; error: string | null }

const INITIAL_EXPANDED_SECTIONS = new Set(['crew-projects'])

function createInitialState(): CrewSidebarState {
  return {
    expandedSections: new Set(INITIAL_EXPANDED_SECTIONS),
    projects: [],
    sessions: {},
    addProjectError: null,
    isAddingProject: false,
  }
}

function crewSidebarReducer(state: CrewSidebarState, action: CrewSidebarAction): CrewSidebarState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return {
        ...state,
        projects: action.payload.projects,
        sessions: action.payload.sessions,
      }
    case 'TOGGLE_SECTION': {
      const expandedSections = new Set(state.expandedSections)
      if (expandedSections.has(action.sectionId)) {
        expandedSections.delete(action.sectionId)
      } else {
        expandedSections.add(action.sectionId)
      }
      return { ...state, expandedSections }
    }
    case 'START_ADDING_PROJECT':
      return {
        ...state,
        addProjectError: null,
        isAddingProject: true,
      }
    case 'FINISH_ADDING_PROJECT':
      return {
        ...state,
        isAddingProject: false,
      }
    case 'SET_ADD_PROJECT_ERROR':
      return {
        ...state,
        addProjectError: action.error,
      }
  }
}

function sortProjects(projects: CrewProject[]): CrewProject[] {
  return [...projects].sort((left, right) => {
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
}

export function CrewSidebar({ onItemSelect, selectedItem }: CrewSidebarProps) {
  const [state, dispatch] = useReducer(crewSidebarReducer, undefined, createInitialState)
  const { expandedSections, projects, sessions, addProjectError, isAddingProject } = state

  const loadProjects = useCallback(async () => {
    const list: CrewProject[] = await window.crew.listProjects()
    const sortedProjects = sortProjects(list)
    const sessionMap: Record<string, CrewSession | null> = {}
    for (const p of sortedProjects) {
      sessionMap[p.id] = await window.crew.getSession(p.id)
    }
    dispatch({
      type: 'SET_PROJECTS',
      payload: {
        projects: sortedProjects,
        sessions: sessionMap,
      },
    })
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleAddProject = async () => {
    if (isAddingProject) return

    dispatch({ type: 'START_ADDING_PROJECT' })

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
        dispatch({ type: 'SET_ADD_PROJECT_ERROR', error: result.error })
      }
    } catch (error) {
      dispatch({
        type: 'SET_ADD_PROJECT_ERROR',
        error: error instanceof Error ? error.message : 'Failed to add project.',
      })
    } finally {
      dispatch({ type: 'FINISH_ADDING_PROJECT' })
    }
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    await window.crew.removeProject(projectId)
    await loadProjects()
  }

  const toggleSection = (sectionId: string) => {
    dispatch({ type: 'TOGGLE_SECTION', sectionId })
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>THE CREW</h2>
        <button
          type="button"
          className="sidebar-header-action crew-add-project-btn"
          onClick={handleAddProject}
          disabled={isAddingProject}
          title="Add Project"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="sidebar-panel-content">
        <div className="sidebar-section">
          <button
            type="button"
            className="sidebar-section-header"
            onClick={() => toggleSection('crew-projects')}
            aria-expanded={expandedSections.has('crew-projects')}
            aria-controls="crew-projects-section"
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
          </button>
          {expandedSections.has('crew-projects') && (
            <div className="sidebar-section-items" id="crew-projects-section">
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
                    >
                      <button
                        type="button"
                        className="sidebar-item-main"
                        onClick={() => onItemSelect(viewId)}
                        title={`${project.githubSlug}\n${project.localPath}`}
                        aria-pressed={selectedItem === viewId}
                      >
                        <span className="sidebar-item-icon">
                          {isActive ? (
                            <Circle size={10} fill="#4ec9b0" stroke="#4ec9b0" />
                          ) : (
                            <FolderGit2 size={14} />
                          )}
                        </span>
                        <span className="sidebar-item-label">{project.displayName}</span>
                      </button>
                      <button
                        type="button"
                        className="sidebar-item-action crew-remove-project-btn"
                        onClick={e => handleRemoveProject(e, project.id)}
                        title="Remove project"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })
              )}
              <button
                type="button"
                className="sidebar-item sidebar-item-button"
                onClick={handleAddProject}
                disabled={isAddingProject}
                style={{
                  opacity: isAddingProject ? 0.45 : 0.7,
                }}
              >
                <span className="sidebar-item-icon">
                  <Plus size={14} />
                </span>
                <span className="sidebar-item-label">
                  {isAddingProject ? 'Opening folder picker…' : 'Add Project…'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
