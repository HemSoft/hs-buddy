import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CrewProjectView } from './CrewProjectView'
import type { CrewChatMessage, CrewChangedFile, CrewProject, CrewSession } from '../../types/crew'

const mockListProjects = vi.fn<() => Promise<CrewProject[]>>()
const mockGetSession = vi.fn<(projectId: string) => Promise<CrewSession | null>>()
const mockCreateSession = vi.fn<(projectId: string) => Promise<CrewSession>>()
const mockAddMessage =
  vi.fn<(projectId: string, message: CrewChatMessage) => Promise<CrewSession | null>>()
const mockUpdateSessionStatus =
  vi.fn<(projectId: string, status: CrewSession['status']) => Promise<CrewSession | null>>()
const mockUpdateChangedFiles =
  vi.fn<(projectId: string, files: CrewChangedFile[]) => Promise<CrewSession | null>>()
const mockClearSession = vi.fn<(projectId: string) => Promise<boolean>>()
const mockUndoFile = vi.fn<(projectId: string, filePath: string) => Promise<boolean>>()
const mockChatSend = vi.fn()

let projects: CrewProject[] = []
let sessionsByProject: Record<string, CrewSession | null> = {}

function createProject(overrides: Partial<CrewProject>): CrewProject {
  return {
    id: 'project-1',
    displayName: 'Crew App',
    localPath: '/workspaces/crew-app',
    gitRoot: '/workspaces/crew-app',
    githubSlug: 'org/crew-app',
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

describe('CrewProjectView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects = []
    sessionsByProject = {}

    mockListProjects.mockImplementation(async () => projects)
    mockGetSession.mockImplementation(async projectId => sessionsByProject[projectId] ?? null)
    mockCreateSession.mockImplementation(async projectId => {
      const session = createSession(projectId)
      sessionsByProject[projectId] = session
      return session
    })
    mockAddMessage.mockImplementation(async projectId => sessionsByProject[projectId] ?? null)
    mockUpdateSessionStatus.mockImplementation(
      async projectId => sessionsByProject[projectId] ?? null
    )
    mockUpdateChangedFiles.mockImplementation(async (projectId, files) => {
      const current = sessionsByProject[projectId]
      if (current) {
        sessionsByProject[projectId] = { ...current, changedFiles: files }
      }
      return sessionsByProject[projectId] ?? null
    })
    mockClearSession.mockImplementation(async projectId => {
      sessionsByProject[projectId] = null
      return true
    })
    mockUndoFile.mockImplementation(async projectId => {
      const current = sessionsByProject[projectId]
      if (current) {
        sessionsByProject[projectId] = { ...current, changedFiles: [] }
      }
      return true
    })
    mockChatSend.mockResolvedValue({ content: 'Copilot reply' })

    Object.defineProperty(window, 'crew', {
      value: {
        listProjects: mockListProjects,
        getSession: mockGetSession,
        createSession: mockCreateSession,
        addMessage: mockAddMessage,
        updateSessionStatus: mockUpdateSessionStatus,
        updateChangedFiles: mockUpdateChangedFiles,
        clearSession: mockClearSession,
        undoFile: mockUndoFile,
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(window, 'copilot', {
      value: {
        chatSend: mockChatSend,
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })
  })

  it('renders a not-found state when the project does not exist', async () => {
    render(<CrewProjectView projectId="missing-project" />)

    expect(await screen.findByText('Project not found.')).toBeTruthy()
  })

  it('starts a new session for a known project', async () => {
    const project = createProject({ id: 'project-1', displayName: 'Crew App' })
    const startedSession = createSession(project.id)

    projects = [project]
    mockCreateSession.mockResolvedValue(startedSession)

    render(<CrewProjectView projectId={project.id} />)

    await screen.findByText('Crew App')
    fireEvent.click(screen.getByText('Start Session'))

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(project.id)
    })

    expect(await screen.findByPlaceholderText('Ask Copilot about this project…')).toBeTruthy()
  })

  it('renders session details and clears the session', async () => {
    const project = createProject({ id: 'project-1' })

    projects = [project]
    sessionsByProject = {
      [project.id]: createSession(project.id, {
        status: 'error',
        conversationHistory: [
          { role: 'user', content: 'Hello', timestamp: 1 },
          { role: 'assistant', content: 'Hi there', timestamp: 2 },
        ],
        changedFiles: [{ filePath: 'src/App.tsx', status: 'modified', additions: 3, deletions: 1 }],
      }),
    }

    render(<CrewProjectView projectId={project.id} />)

    expect(await screen.findByText(project.githubSlug)).toBeTruthy()
    expect(screen.getByText(project.localPath)).toBeTruthy()
    expect(screen.getByText('Changed Files')).toBeTruthy()
    expect(screen.getByText('src/App.tsx')).toBeTruthy()
    expect(screen.getByText('Session encountered an error')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Clear session'))

    await waitFor(() => {
      expect(mockClearSession).toHaveBeenCalledWith(project.id)
    })

    expect(await screen.findByText('Start Session')).toBeTruthy()
  })

  it('keeps changed files and reloads the session', async () => {
    const project = createProject({ id: 'project-1' })
    const changedFiles: CrewChangedFile[] = [
      { filePath: 'src/App.tsx', status: 'modified', additions: 3, deletions: 1 },
    ]

    projects = [project]
    sessionsByProject = {
      [project.id]: createSession(project.id, { changedFiles }),
    }

    render(<CrewProjectView projectId={project.id} />)

    expect(await screen.findByText('src/App.tsx')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Keep'))

    await waitFor(() => {
      expect(mockUpdateChangedFiles).toHaveBeenCalledWith(project.id, [])
    })
  })

  it('undos changed files and reloads the session', async () => {
    const project = createProject({ id: 'project-1' })
    const changedFiles: CrewChangedFile[] = [
      { filePath: 'src/App.tsx', status: 'modified', additions: 3, deletions: 1 },
    ]

    projects = [project]
    sessionsByProject = {
      [project.id]: createSession(project.id, { changedFiles }),
    }

    render(<CrewProjectView projectId={project.id} />)

    expect(await screen.findByText('src/App.tsx')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Undo'))

    await waitFor(() => {
      expect(mockUndoFile).toHaveBeenCalledWith(project.id, 'src/App.tsx')
    })
  })

  it('sends a message successfully and appends the assistant reply', async () => {
    const project = createProject({ id: 'project-1' })
    const existingSession = createSession(project.id, {
      conversationHistory: [{ role: 'assistant', content: 'Earlier context', timestamp: 1 }],
    })

    projects = [project]
    sessionsByProject = {
      [project.id]: existingSession,
    }
    mockChatSend.mockResolvedValue({ content: 'New answer' })

    render(<CrewProjectView projectId={project.id} />)

    const textarea = await screen.findByPlaceholderText('Ask Copilot about this project…')
    fireEvent.change(textarea, { target: { value: 'Investigate this repo' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(mockAddMessage).toHaveBeenCalledWith(
        project.id,
        expect.objectContaining({ role: 'user', content: 'Investigate this repo' })
      )
    })

    expect(mockUpdateSessionStatus).toHaveBeenCalledWith(project.id, 'active')
    expect(mockChatSend).toHaveBeenCalledWith({
      message: 'Investigate this repo',
      context: `Project: ${project.githubSlug} at ${project.localPath}`,
      conversationHistory: [{ role: 'assistant', content: 'Earlier context' }],
    })

    await waitFor(() => {
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith(project.id, 'idle')
    })

    expect(await screen.findByText('New answer')).toBeTruthy()
  })

  it('shows an error message when sending fails', async () => {
    const project = createProject({ id: 'project-1' })

    projects = [project]
    sessionsByProject = {
      [project.id]: createSession(project.id),
    }
    mockChatSend.mockRejectedValue(new Error('Copilot unavailable'))

    render(<CrewProjectView projectId={project.id} />)

    const textarea = await screen.findByPlaceholderText('Ask Copilot about this project…')
    fireEvent.change(textarea, { target: { value: 'Investigate this repo' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith(project.id, 'error')
    })

    expect(await screen.findByText('Session encountered an error')).toBeTruthy()
    expect(screen.getByText('Error: Copilot unavailable')).toBeTruthy()
  })
})
