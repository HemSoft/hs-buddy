import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CrewSidebar, resolveAddProjectError, applyAddProjectResult } from './CrewSidebar'
import type { CrewAddProjectResult, CrewProject, CrewSession } from '../../types/crew'

const mockListProjects = vi.fn<() => Promise<CrewProject[]>>()
const mockGetSession = vi.fn<(projectId: string) => Promise<CrewSession | null>>()
const mockAddProject = vi.fn<() => Promise<CrewAddProjectResult>>()
const mockRemoveProject = vi.fn<(projectId: string) => Promise<boolean>>()

let projects: CrewProject[] = []
let sessionsByProject: Record<string, CrewSession | null> = {}

function createProject(overrides: Partial<CrewProject>): CrewProject {
  return {
    id: 'project-1',
    displayName: 'Alpha',
    localPath: '/workspaces/alpha',
    gitRoot: '/workspaces/alpha',
    githubSlug: 'org/alpha',
    defaultBranch: 'main',
    lastOpenedAt: 1,
    lastActiveAt: 1,
    ...overrides,
  }
}

function createSession(projectId: string, overrides: Partial<CrewSession> = {}): CrewSession {
  return {
    id: `session-${projectId}`,
    projectId,
    status: 'idle',
    conversationHistory: [],
    changedFiles: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('CrewSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects = []
    sessionsByProject = {}

    mockListProjects.mockImplementation(async () => projects)
    mockGetSession.mockImplementation(async projectId => sessionsByProject[projectId] ?? null)
    mockAddProject.mockResolvedValue({ success: false, error: 'Cancelled' })
    mockRemoveProject.mockResolvedValue(true)

    Object.defineProperty(window, 'crew', {
      value: {
        listProjects: mockListProjects,
        getSession: mockGetSession,
        addProject: mockAddProject,
        removeProject: mockRemoveProject,
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders the empty state when there are no projects', async () => {
    render(<CrewSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    expect(await screen.findByText('No projects yet')).toBeTruthy()
    expect(mockListProjects).toHaveBeenCalledTimes(1)
  })

  it('renders projects in sorted order and selects a project', async () => {
    const onItemSelect = vi.fn()

    projects = [
      createProject({ id: 'bravo', displayName: 'Bravo', githubSlug: 'org/bravo' }),
      createProject({ id: 'alpha', displayName: 'Alpha', githubSlug: 'org/alpha' }),
      createProject({ id: 'charlie', displayName: 'Charlie', githubSlug: 'org/charlie' }),
    ]
    sessionsByProject = {
      alpha: createSession('alpha', { status: 'active' }),
      bravo: null,
      charlie: null,
    }

    render(<CrewSidebar onItemSelect={onItemSelect} selectedItem="crew-project:alpha" />)

    await screen.findByText('Alpha')

    const projectButtons = screen
      .getAllByRole('button')
      .filter(button => ['Alpha', 'Bravo', 'Charlie'].includes(button.textContent ?? ''))

    expect(projectButtons.map(button => button.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(screen.getByText('3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Bravo' }))

    expect(onItemSelect).toHaveBeenCalledWith('crew-project:bravo')
  })

  it('collapses and expands the projects section', async () => {
    projects = [createProject({ id: 'alpha', displayName: 'Alpha' })]

    render(<CrewSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await screen.findByText('Alpha')

    const sectionToggle = screen.getByRole('button', { name: /Projects/i })
    fireEvent.click(sectionToggle)

    expect(screen.queryByText('Alpha')).toBeNull()

    fireEvent.click(sectionToggle)

    expect(await screen.findByText('Alpha')).toBeTruthy()
  })

  it('adds a project and selects it after reload', async () => {
    const onItemSelect = vi.fn()
    const newProject = createProject({
      id: 'delta',
      displayName: 'Delta',
      githubSlug: 'org/delta',
      localPath: '/workspaces/delta',
      gitRoot: '/workspaces/delta',
    })

    projects = [createProject({ id: 'alpha', displayName: 'Alpha' })]
    mockAddProject.mockImplementation(async () => {
      projects = [...projects, newProject]
      return { success: true, project: newProject }
    })

    render(<CrewSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    await screen.findByText('Alpha')
    fireEvent.click(screen.getByTitle('Add Project'))

    await waitFor(() => {
      expect(onItemSelect).toHaveBeenCalledWith('crew-project:delta')
    })

    expect(mockListProjects).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Delta')).toBeTruthy()
  })

  it('shows add-project errors and removes projects', async () => {
    projects = [createProject({ id: 'alpha', displayName: 'Alpha' })]
    mockAddProject.mockResolvedValue({ success: false, error: 'Folder is not a git repository' })
    mockRemoveProject.mockImplementation(async projectId => {
      projects = projects.filter(project => project.id !== projectId)
      return true
    })

    render(<CrewSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await screen.findByText('Alpha')

    fireEvent.click(screen.getByText('Add Project…'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Folder is not a git repository')

    fireEvent.click(screen.getByTitle('Remove project'))

    await waitFor(() => {
      expect(mockRemoveProject).toHaveBeenCalledWith('alpha')
    })

    expect(await screen.findByText('No projects yet')).toBeTruthy()
  })

  it('breaks displayName ties using githubSlug', async () => {
    projects = [
      createProject({ id: 'z-proj', displayName: 'Same Name', githubSlug: 'org/zebra' }),
      createProject({ id: 'a-proj', displayName: 'Same Name', githubSlug: 'org/alpha' }),
    ]

    const onItemSelect = vi.fn()
    render(<CrewSidebar onItemSelect={onItemSelect} selectedItem={null} />)

    const buttons = await screen.findAllByText('Same Name')
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[0])
    expect(onItemSelect).toHaveBeenCalledWith('crew-project:a-proj')
  })

  it('handles non-Error thrown values in addProject catch block', async () => {
    projects = [createProject({ id: 'alpha', displayName: 'Alpha' })]
    mockAddProject.mockRejectedValue('string error value')

    render(<CrewSidebar onItemSelect={vi.fn()} selectedItem={null} />)

    await screen.findByText('Alpha')
    fireEvent.click(screen.getByTitle('Add Project'))

    expect(await screen.findByRole('alert')).toHaveTextContent('string error value')
  })
})

// ─── Pure helper function tests ─────────────────────────────────────────

describe('resolveAddProjectError', () => {
  it('returns null when error is undefined', () => {
    expect(resolveAddProjectError({ success: false } as CrewAddProjectResult)).toBeNull()
  })

  it('returns null when error is "Cancelled"', () => {
    expect(
      resolveAddProjectError({ success: false, error: 'Cancelled' } as CrewAddProjectResult)
    ).toBeNull()
  })

  it('returns the error string when present and not Cancelled', () => {
    expect(
      resolveAddProjectError({ success: false, error: 'Permission denied' } as CrewAddProjectResult)
    ).toBe('Permission denied')
  })
})

describe('applyAddProjectResult', () => {
  it('loads projects and selects item on success with project', async () => {
    const loadProjects = vi.fn().mockResolvedValue(undefined)
    const onItemSelect = vi.fn()
    const dispatch = vi.fn()
    const result = { success: true, project: { id: 'p1' } } as CrewAddProjectResult

    await applyAddProjectResult(result, loadProjects, onItemSelect, dispatch)
    expect(loadProjects).toHaveBeenCalled()
    expect(onItemSelect).toHaveBeenCalledWith('crew-project:p1')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('loads projects but does not select when project is null', async () => {
    const loadProjects = vi.fn().mockResolvedValue(undefined)
    const onItemSelect = vi.fn()
    const dispatch = vi.fn()
    const result = { success: true, project: null } as unknown as CrewAddProjectResult

    await applyAddProjectResult(result, loadProjects, onItemSelect, dispatch)
    expect(loadProjects).toHaveBeenCalled()
    expect(onItemSelect).not.toHaveBeenCalled()
  })

  it('dispatches error when failure with non-Cancelled error', async () => {
    const loadProjects = vi.fn()
    const onItemSelect = vi.fn()
    const dispatch = vi.fn()
    const result = { success: false, error: 'Disk full' } as CrewAddProjectResult

    await applyAddProjectResult(result, loadProjects, onItemSelect, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ADD_PROJECT_ERROR', error: 'Disk full' })
  })

  it('does not dispatch when failure with Cancelled error', async () => {
    const loadProjects = vi.fn()
    const onItemSelect = vi.fn()
    const dispatch = vi.fn()
    const result = { success: false, error: 'Cancelled' } as CrewAddProjectResult

    await applyAddProjectResult(result, loadProjects, onItemSelect, dispatch)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
