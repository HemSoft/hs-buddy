import { ChevronDown, ChevronRight, FolderGit2, Plus, Trash2, Circle } from 'lucide-react'
import { useEffect, useCallback, useReducer } from 'react'
import type { CrewProject, CrewSession } from '../../types/crew'
import { getUserFacingErrorMessage } from '../../utils/errorUtils'
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

function toggleInSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

type CrewSidebarDispatch = (action: CrewSidebarAction) => void

type CrewAddProjectResult = {
  success: boolean
  project?: { id: string } | null
  error?: string | null
}

const CREW_SIDEBAR_ACTION_HANDLERS = {
  SET_PROJECTS: (
    state: CrewSidebarState,
    action: Extract<CrewSidebarAction, { type: 'SET_PROJECTS' }>
  ): CrewSidebarState => ({
    ...state,
    projects: action.payload.projects,
    sessions: action.payload.sessions,
  }),
  TOGGLE_SECTION: (
    state: CrewSidebarState,
    action: Extract<CrewSidebarAction, { type: 'TOGGLE_SECTION' }>
  ): CrewSidebarState => ({
    ...state,
    expandedSections: toggleInSet(state.expandedSections, action.sectionId),
  }),
  START_ADDING_PROJECT: (state: CrewSidebarState): CrewSidebarState => ({
    ...state,
    addProjectError: null,
    isAddingProject: true,
  }),
  FINISH_ADDING_PROJECT: (state: CrewSidebarState): CrewSidebarState => ({
    ...state,
    isAddingProject: false,
  }),
  SET_ADD_PROJECT_ERROR: (
    state: CrewSidebarState,
    action: Extract<CrewSidebarAction, { type: 'SET_ADD_PROJECT_ERROR' }>
  ): CrewSidebarState => ({
    ...state,
    addProjectError: action.error,
  }),
} satisfies {
  [K in CrewSidebarAction['type']]: (
    state: CrewSidebarState,
    action: Extract<CrewSidebarAction, { type: K }>
  ) => CrewSidebarState
}

function crewSidebarReducer(state: CrewSidebarState, action: CrewSidebarAction): CrewSidebarState {
  const handler = CREW_SIDEBAR_ACTION_HANDLERS[action.type] as (
    state: CrewSidebarState,
    action: CrewSidebarAction
  ) => CrewSidebarState
  return handler(state, action)
}

function sortProjects(projects: CrewProject[]): CrewProject[] {
  return Array.from(projects).sort((left, right) => {
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

function getAddProjectState(isAdding: boolean) {
  return {
    style: { opacity: isAdding ? 0.45 : 0.7 },
    label: isAdding ? 'Opening folder picker…' : 'Add Project…',
  }
}

// eslint-disable-next-line react-refresh/only-export-components -- extracted helper
export function resolveAddProjectError(result: CrewAddProjectResult): string | null {
  return result.error && result.error !== 'Cancelled' ? result.error : null
}

// eslint-disable-next-line react-refresh/only-export-components -- extracted helper
export async function applyAddProjectResult(
  result: CrewAddProjectResult,
  loadProjects: () => Promise<void>,
  onItemSelect: (itemId: string) => void,
  dispatch: CrewSidebarDispatch
): Promise<void> {
  if (result.success) {
    await loadProjects()
    if (result.project) {
      onItemSelect(`crew-project:${result.project.id}`)
    }
    return
  }

  const addProjectError = resolveAddProjectError(result)
  if (addProjectError) {
    dispatch({ type: 'SET_ADD_PROJECT_ERROR', error: addProjectError })
  }
}

function dispatchAddProjectFailure(dispatch: CrewSidebarDispatch, error: unknown): void {
  dispatch({
    type: 'SET_ADD_PROJECT_ERROR',
    error: getUserFacingErrorMessage(error, 'Failed to add project.'),
  })
}

function ProjectSectionHeader({
  isExpanded,
  projectCount,
  onToggle,
}: {
  isExpanded: boolean
  projectCount: number
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="sidebar-section-header"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls="crew-projects-section"
    >
      <div className="sidebar-section-title">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="sidebar-section-icon">
          <FolderGit2 size={16} />
        </span>
        <span>Projects</span>
        {projectCount > 0 ? <span className="sidebar-item-count">{projectCount}</span> : null}
      </div>
    </button>
  )
}

function ProjectListItem({
  project,
  session,
  selectedItem,
  onItemSelect,
  onRemoveProject,
}: {
  project: CrewProject
  session: CrewSession | null
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onRemoveProject: (event: React.MouseEvent, projectId: string) => Promise<void>
}) {
  const viewId = `crew-project:${project.id}`
  const isActive = session?.status === 'active'

  return (
    <div className={`sidebar-item ${selectedItem === viewId ? 'selected' : ''}`}>
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
        onClick={event => onRemoveProject(event, project.id)}
        title="Remove project"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function AddProjectButton({
  isAddingProject,
  onAddProject,
}: {
  isAddingProject: boolean
  onAddProject: () => void
}) {
  const addProjectState = getAddProjectState(isAddingProject)

  return (
    <button
      type="button"
      className="sidebar-item sidebar-item-button"
      onClick={onAddProject}
      disabled={isAddingProject}
      style={addProjectState.style}
    >
      <span className="sidebar-item-icon">
        <Plus size={14} />
      </span>
      <span className="sidebar-item-label">{addProjectState.label}</span>
    </button>
  )
}

function ProjectSectionItems({
  addProjectError,
  isAddingProject,
  projects,
  sessions,
  selectedItem,
  onItemSelect,
  onRemoveProject,
  onAddProject,
}: {
  addProjectError: string | null
  isAddingProject: boolean
  projects: CrewProject[]
  sessions: Record<string, CrewSession | null>
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onRemoveProject: (event: React.MouseEvent, projectId: string) => Promise<void>
  onAddProject: () => void
}) {
  return (
    <div className="sidebar-section-items" id="crew-projects-section">
      {addProjectError ? (
        <div
          className="sidebar-item sidebar-item-empty"
          role="alert"
          style={{ color: '#e85d5d', whiteSpace: 'normal' }}
        >
          <span className="sidebar-item-label">{addProjectError}</span>
        </div>
      ) : null}
      {projects.length === 0 ? (
        <div className="sidebar-item sidebar-item-empty">
          <span className="sidebar-item-label">No projects yet</span>
        </div>
      ) : (
        projects.map(project => (
          <ProjectListItem
            key={project.id}
            project={project}
            session={sessions[project.id]}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
            onRemoveProject={onRemoveProject}
          />
        ))
      )}
      <AddProjectButton isAddingProject={isAddingProject} onAddProject={onAddProject} />
    </div>
  )
}

function ProjectsSection({
  expandedSections,
  projects,
  sessions,
  addProjectError,
  isAddingProject,
  selectedItem,
  onItemSelect,
  onRemoveProject,
  onToggle,
  onAddProject,
}: {
  expandedSections: Set<string>
  projects: CrewProject[]
  sessions: Record<string, CrewSession | null>
  addProjectError: string | null
  isAddingProject: boolean
  selectedItem: string | null
  onItemSelect: (itemId: string) => void
  onRemoveProject: (event: React.MouseEvent, projectId: string) => Promise<void>
  onToggle: () => void
  onAddProject: () => void
}) {
  const isExpanded = expandedSections.has('crew-projects')

  return (
    <div className="sidebar-section">
      <ProjectSectionHeader
        isExpanded={isExpanded}
        projectCount={projects.length}
        onToggle={onToggle}
      />
      {isExpanded ? (
        <ProjectSectionItems
          addProjectError={addProjectError}
          isAddingProject={isAddingProject}
          projects={projects}
          sessions={sessions}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
          onRemoveProject={onRemoveProject}
          onAddProject={onAddProject}
        />
      ) : null}
    </div>
  )
}

export function CrewSidebar({ onItemSelect, selectedItem }: CrewSidebarProps) {
  const [state, dispatch] = useReducer(crewSidebarReducer, undefined, createInitialState)
  const { expandedSections, projects, sessions, addProjectError, isAddingProject } = state

  const loadProjects = useCallback(async () => {
    const list: CrewProject[] = await window.crew.listProjects()
    const sortedProjects = sortProjects(list)
    const sessionEntries = await Promise.all(
      sortedProjects.map(
        async project => [project.id, await window.crew.getSession(project.id)] as const
      )
    )
    const sessionMap: Record<string, CrewSession | null> = Object.fromEntries(sessionEntries)
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
    /* v8 ignore start */
    if (isAddingProject) return
    /* v8 ignore stop */

    dispatch({ type: 'START_ADDING_PROJECT' })

    try {
      const result: CrewAddProjectResult = await window.crew.addProject()
      await applyAddProjectResult(result, loadProjects, onItemSelect, dispatch)
    } catch (error: unknown) {
      dispatchAddProjectFailure(dispatch, error)
    } finally {
      dispatch({ type: 'FINISH_ADDING_PROJECT' })
    }
  }

  const handleRemoveProject = async (event: React.MouseEvent, projectId: string) => {
    event.stopPropagation()
    await window.crew.removeProject(projectId)
    await loadProjects()
  }

  const toggleProjectSection = () => {
    dispatch({ type: 'TOGGLE_SECTION', sectionId: 'crew-projects' })
  }

  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel-header">
        <h2>THE CREW</h2>
        <button
          aria-label="Add Project"
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
        <ProjectsSection
          expandedSections={expandedSections}
          projects={projects}
          sessions={sessions}
          addProjectError={addProjectError}
          isAddingProject={isAddingProject}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
          onRemoveProject={handleRemoveProject}
          onToggle={toggleProjectSection}
          onAddProject={handleAddProject}
        />
      </div>
    </div>
  )
}
