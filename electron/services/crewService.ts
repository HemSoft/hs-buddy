import { app, dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  CrewProject,
  CrewSession,
  CrewChatMessage,
  CrewChangedFile,
  CrewAddProjectResult,
  CrewValidationResult,
} from '../../src/types/crew'

const execFileAsync = promisify(execFile)

function getCrewDataDir(): string {
  const dir = join(app.getPath('userData'), 'crew')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getProjectsPath(): string {
  return join(getCrewDataDir(), 'projects.json')
}

function getSessionsPath(): string {
  return join(getCrewDataDir(), 'sessions.json')
}

function readProjects(): CrewProject[] {
  const p = getProjectsPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

function writeProjects(projects: CrewProject[]): void {
  writeFileSync(getProjectsPath(), JSON.stringify(projects, null, 2))
}

function readSessions(): CrewSession[] {
  const p = getSessionsPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

function writeSessions(sessions: CrewSession[]): void {
  writeFileSync(getSessionsPath(), JSON.stringify(sessions, null, 2))
}

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 5000 })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function validateFolder(folderPath: string): Promise<CrewValidationResult> {
  const gitRoot = await runGit(folderPath, ['rev-parse', '--show-toplevel'])
  if (!gitRoot) {
    return { valid: false, error: 'Not a git repository' }
  }

  const originUrl = await runGit(gitRoot, ['remote', 'get-url', 'origin'])
  if (!originUrl) {
    return { valid: false, error: 'No origin remote found' }
  }

  // Accept github.com HTTPS or SSH URLs
  const httpsMatch = originUrl.match(/github\.com\/([^/]+\/[^/.\s]+?)(?:\.git)?$/)
  const sshMatch = originUrl.match(/github\.com:([^/]+\/[^/.\s]+?)(?:\.git)?$/)
  const slug = httpsMatch?.[1] ?? sshMatch?.[1]
  if (!slug) {
    return { valid: false, error: 'Origin remote is not a GitHub repository' }
  }

  const defaultBranch =
    (await runGit(gitRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']))?.replace('origin/', '') ??
    (await runGit(gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])) ??
    'main'

  return { valid: true, gitRoot, githubSlug: slug, defaultBranch }
}

export async function addProjectFromPicker(): Promise<CrewAddProjectResult> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select a project folder',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: 'Cancelled' }
  }

  const folderPath = result.filePaths[0]
  const validation = await validateFolder(folderPath)
  if (!validation.valid || !validation.gitRoot || !validation.githubSlug) {
    return { success: false, error: validation.error ?? 'Validation failed' }
  }

  const projects = readProjects()
  const existing = projects.find(p => p.gitRoot === validation.gitRoot)
  if (existing) {
    // Update last opened and return existing
    existing.lastOpenedAt = Date.now()
    writeProjects(projects)
    return { success: true, project: existing }
  }

  const repoName = validation.githubSlug.split('/').pop() ?? validation.githubSlug
  const now = Date.now()
  const project: CrewProject = {
    id: `crew-${now}-${Math.random().toString(36).slice(2, 8)}`,
    displayName: repoName,
    localPath: validation.gitRoot,
    gitRoot: validation.gitRoot,
    githubSlug: validation.githubSlug,
    defaultBranch: validation.defaultBranch ?? 'main',
    lastOpenedAt: now,
    lastActiveAt: now,
  }

  projects.push(project)
  writeProjects(projects)
  return { success: true, project }
}

export function listProjects(): CrewProject[] {
  return readProjects()
}

export function removeProject(projectId: string): boolean {
  const projects = readProjects()
  const idx = projects.findIndex(p => p.id === projectId)
  if (idx < 0) return false
  projects.splice(idx, 1)
  writeProjects(projects)

  // Also remove sessions for this project
  const sessions = readSessions().filter(s => s.projectId !== projectId)
  writeSessions(sessions)
  return true
}

export function getSession(projectId: string): CrewSession | null {
  return readSessions().find(s => s.projectId === projectId) ?? null
}

export function createOrGetSession(projectId: string): CrewSession {
  const sessions = readSessions()
  const existing = sessions.find(s => s.projectId === projectId)
  if (existing) return existing

  const now = Date.now()
  const session: CrewSession = {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    status: 'idle',
    conversationHistory: [],
    changedFiles: [],
    createdAt: now,
    updatedAt: now,
  }
  sessions.push(session)
  writeSessions(sessions)
  return session
}

export function addMessageToSession(
  projectId: string,
  message: CrewChatMessage
): CrewSession | null {
  const sessions = readSessions()
  const session = sessions.find(s => s.projectId === projectId)
  if (!session) return null
  session.conversationHistory.push(message)
  session.updatedAt = Date.now()
  writeSessions(sessions)
  return session
}

export function updateSessionStatus(
  projectId: string,
  status: CrewSession['status']
): CrewSession | null {
  const sessions = readSessions()
  const session = sessions.find(s => s.projectId === projectId)
  if (!session) return null
  session.status = status
  session.updatedAt = Date.now()
  writeSessions(sessions)
  return session
}

export function updateSessionChangedFiles(
  projectId: string,
  changedFiles: CrewChangedFile[]
): CrewSession | null {
  const sessions = readSessions()
  const session = sessions.find(s => s.projectId === projectId)
  if (!session) return null
  session.changedFiles = changedFiles
  session.updatedAt = Date.now()
  writeSessions(sessions)
  return session
}

export function clearSession(projectId: string): boolean {
  const sessions = readSessions()
  const idx = sessions.findIndex(s => s.projectId === projectId)
  if (idx < 0) return false
  sessions.splice(idx, 1)
  writeSessions(sessions)
  return true
}

export async function undoFile(projectId: string, filePath: string): Promise<boolean> {
  const projects = readProjects()
  const project = projects.find(p => p.id === projectId)
  if (!project) return false

  const result = await runGit(project.gitRoot, ['checkout', 'HEAD', '--', filePath])
  if (result === null) return false

  const sessions = readSessions()
  const session = sessions.find(s => s.projectId === projectId)
  if (session) {
    session.changedFiles = session.changedFiles.filter(f => f.filePath !== filePath)
    session.updatedAt = Date.now()
    writeSessions(sessions)
  }
  return true
}
