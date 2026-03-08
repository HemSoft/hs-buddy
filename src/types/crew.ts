/** Crew project registered in the local project registry */
export interface CrewProject {
  id: string
  displayName: string
  localPath: string
  gitRoot: string
  githubSlug: string // owner/repo
  defaultBranch: string
  lastOpenedAt: number // epoch ms
  lastActiveAt: number // epoch ms
}

/** A Copilot session associated with a Crew project */
export interface CrewSession {
  id: string
  projectId: string
  status: 'idle' | 'active' | 'error'
  conversationHistory: CrewChatMessage[]
  changedFiles: CrewChangedFile[]
  createdAt: number
  updatedAt: number
}

export interface CrewChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface CrewChangedFile {
  filePath: string
  status: 'added' | 'modified' | 'deleted'
  additions?: number
  deletions?: number
}

/** Result from adding a project via folder picker */
export interface CrewAddProjectResult {
  success: boolean
  project?: CrewProject
  error?: string
}

/** Validation result for a folder as a Crew project */
export interface CrewValidationResult {
  valid: boolean
  gitRoot?: string
  githubSlug?: string
  defaultBranch?: string
  error?: string
}
