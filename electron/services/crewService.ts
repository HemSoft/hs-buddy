import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
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

function readJsonFile<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T[]
  } catch {
    return []
  }
}

function writeJsonFile<T>(filePath: string, data: T[]): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function readProjects(): CrewProject[] {
  return readJsonFile<CrewProject>(getProjectsPath())
}

function writeProjects(projects: CrewProject[]): void {
  writeJsonFile(getProjectsPath(), projects)
}

function readSessions(): CrewSession[] {
  return readJsonFile<CrewSession>(getSessionsPath())
}

function writeSessions(sessions: CrewSession[]): void {
  writeJsonFile(getSessionsPath(), sessions)
}

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 5000 })
    return stdout.trim()
  } catch {
    return null
  }
}

function isGitHubHost(host: string): boolean {
  const normalizedHost = host.trim().toLowerCase()
  return normalizedHost === 'github.com' || normalizedHost.endsWith('.github.com')
}

async function resolveSshHost(host: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ssh', ['-G', host], { timeout: 5000 })
    const hostnameLine = stdout
      .split(/\r?\n/)
      .find(line => line.toLowerCase().startsWith('hostname '))

    return hostnameLine?.slice('hostname '.length).trim() ?? null
  } catch {
    return null
  }
}

async function getGitHubSlug(originUrl: string): Promise<string | null> {
  const httpsMatch = originUrl.match(
    /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+\/[^/.\s]+?)(?:\.git)?$/i
  )
  if (httpsMatch) {
    const [, host, slug] = httpsMatch
    return isGitHubHost(host) ? slug : null
  }

  const sshMatch = originUrl.match(
    /^(?:ssh:\/\/)?(?:.+@)?([^:/]+)[:/]([^/]+\/[^/.\s]+?)(?:\.git)?$/i
  )
  if (!sshMatch) {
    return null
  }

  const [, host, slug] = sshMatch
  if (isGitHubHost(host)) {
    return slug
  }

  const resolvedHost = await resolveSshHost(host)
  return resolvedHost && isGitHubHost(resolvedHost) ? slug : null
}

async function validateFolder(folderPath: string): Promise<CrewValidationResult> {
  const gitRoot = await runGit(folderPath, ['rev-parse', '--show-toplevel'])
  if (!gitRoot) {
    return { valid: false, error: 'Not a git repository' }
  }

  const originUrl = await runGit(gitRoot, ['remote', 'get-url', 'origin'])
  if (!originUrl) {
    return { valid: false, error: 'No origin remote found' }
  }

  const slug = await getGitHubSlug(originUrl)
  if (!slug) {
    return { valid: false, error: 'Origin remote is not a GitHub repository' }
  }

  const defaultBranch =
    (await runGit(gitRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']))?.replace(
      'origin/',
      ''
    ) ??
    (await runGit(gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])) ??
    'main'

  return { valid: true, gitRoot, githubSlug: slug, defaultBranch }
}

async function showFolderPicker(parentWindow?: BrowserWindow | null): Promise<string | null> {
  const dialogOptions: OpenDialogOptions = {
    properties: ['openDirectory'],
    title: 'Select a project folder',
  }

  const result =
    parentWindow && !parentWindow.isDestroyed()
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

function buildNewProject(validation: {
  gitRoot: string
  githubSlug: string
  defaultBranch?: string
}): CrewProject {
  const repoName = validation.githubSlug.split('/').pop() ?? validation.githubSlug
  const now = Date.now()
  return {
    id: `crew-${now}-${Math.random().toString(36).slice(2, 8)}`,
    displayName: repoName,
    localPath: validation.gitRoot,
    gitRoot: validation.gitRoot,
    githubSlug: validation.githubSlug,
    defaultBranch: validation.defaultBranch ?? 'main',
    lastOpenedAt: now,
    lastActiveAt: now,
  }
}

export async function addProjectFromPicker(
  parentWindow?: BrowserWindow | null
): Promise<CrewAddProjectResult> {
  const folderPath = await showFolderPicker(parentWindow)
  if (!folderPath) {
    return { success: false, error: 'Cancelled' }
  }

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

  const project = buildNewProject({
    gitRoot: validation.gitRoot,
    githubSlug: validation.githubSlug,
    defaultBranch: validation.defaultBranch,
  })
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

function modifySession(
  projectId: string,
  updater: (session: CrewSession) => void
): CrewSession | null {
  const sessions = readSessions()
  const session = sessions.find(s => s.projectId === projectId)
  if (!session) return null
  updater(session)
  session.updatedAt = Date.now()
  writeSessions(sessions)
  return session
}

export function addMessageToSession(
  projectId: string,
  message: CrewChatMessage
): CrewSession | null {
  return modifySession(projectId, session => {
    session.conversationHistory.push(message)
  })
}

export function updateSessionStatus(
  projectId: string,
  status: CrewSession['status']
): CrewSession | null {
  return modifySession(projectId, session => {
    session.status = status
  })
}

export function updateSessionChangedFiles(
  projectId: string,
  changedFiles: CrewChangedFile[]
): CrewSession | null {
  return modifySession(projectId, session => {
    session.changedFiles = changedFiles
  })
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

  modifySession(projectId, session => {
    session.changedFiles = session.changedFiles.filter(f => f.filePath !== filePath)
  })
  return true
}
