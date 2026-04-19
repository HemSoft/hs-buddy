import { useState, useEffect, useCallback, useRef, type KeyboardEvent, type RefObject } from 'react'
import {
  Send,
  FolderGit2,
  GitBranch,
  FileText,
  Plus,
  Trash2,
  Undo2,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { CrewProject, CrewSession, CrewChatMessage } from '../../types/crew'
import './Crew.css'

interface CrewProjectViewProps {
  projectId: string
}

interface ProjectHeaderProps {
  project: CrewProject
}

interface SessionStarterProps {
  onStartSession: () => void
}

interface ConversationHistoryProps {
  conversationHistory: CrewChatMessage[]
  sending: boolean
  chatEndRef: RefObject<HTMLDivElement | null>
}

interface ChangedFilesPanelProps {
  changedFiles: CrewSession['changedFiles']
  onKeepFile: (filePath: string) => void
  onUndoFile: (filePath: string) => void
}

interface MessageComposerProps {
  message: string
  sending: boolean
  onMessageChange: (value: string) => void
  onSendMessage: () => void
  onClearSession: () => void
}

interface SessionErrorBannerProps {
  status: CrewSession['status']
}

function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <div
      className="content-header"
      style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-secondary, #333)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FolderGit2 size={18} />
        <h2 style={{ margin: 0, fontSize: '14px' }}>{project.displayName}</h2>
        <span style={{ opacity: 0.5, fontSize: '12px' }}>{project.githubSlug}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '4px',
          fontSize: '12px',
          opacity: 0.6,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GitBranch size={12} /> {project.defaultBranch}
        </span>
        <span>{project.localPath}</span>
      </div>
    </div>
  )
}

function SessionStarter({ onStartSession }: SessionStarterProps) {
  return (
    <div className="crew-session-starter">
      <button onClick={onStartSession} className="crew-start-btn">
        <Plus size={16} /> Start Session
      </button>
    </div>
  )
}

function ConversationHistory({
  conversationHistory,
  sending,
  chatEndRef,
}: ConversationHistoryProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
      {conversationHistory.length === 0 && (
        <div style={{ textAlign: 'center', opacity: 0.5, padding: '24px' }}>
          <p>Send a message to start the conversation.</p>
        </div>
      )}
      {conversationHistory.map(msg => (
        <div
          key={`${msg.role}-${msg.timestamp}`}
          style={{
            marginBottom: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            background:
              msg.role === 'user'
                ? 'var(--accent-primary, #0e639c)22'
                : 'var(--bg-secondary, #252526)',
            borderLeft:
              msg.role === 'assistant' ? '3px solid var(--accent-primary, #0e639c)' : 'none',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>
            {msg.role === 'user' ? 'You' : 'Copilot'}
          </div>
          <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        </div>
      ))}
      {sending && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: 0.6,
            padding: '8px 12px',
          }}
        >
          <Loader2 size={14} className="spin" /> Thinking…
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  )
}

function ChangedFilesPanel({ changedFiles, onKeepFile, onUndoFile }: ChangedFilesPanelProps) {
  if (changedFiles.length === 0) {
    return null
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--bg-secondary, #333)',
        padding: '8px 16px',
        maxHeight: '200px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          marginBottom: '6px',
          opacity: 0.7,
          textTransform: 'uppercase',
        }}
      >
        Changed Files
      </div>
      {changedFiles.map(file => (
        <div
          key={file.filePath}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 0',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={12} />
            <span>{file.filePath}</span>
            {file.additions !== undefined && (
              <span style={{ color: '#4ec9b0' }}>+{file.additions}</span>
            )}
            {file.deletions !== undefined && (
              <span style={{ color: '#e85d5d' }}>-{file.deletions}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => onKeepFile(file.filePath)}
              title="Keep"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#4ec9b0',
                padding: '2px',
              }}
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => onUndoFile(file.filePath)}
              title="Undo"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#e85d5d',
                padding: '2px',
              }}
            >
              <Undo2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessageComposer({
  message,
  sending,
  onMessageChange,
  onSendMessage,
  onClearSession,
}: MessageComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSendMessage()
    }
  }

  const sendDisabled = sending || !message.trim()

  return (
    <div className="crew-chat-input-area">
      <textarea
        value={message}
        onChange={event => onMessageChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Copilot about this project…"
        rows={2}
        disabled={sending}
        className="crew-chat-textarea"
      />
      <button onClick={onSendMessage} disabled={sendDisabled} className="crew-chat-send-btn">
        <Send size={16} />
      </button>
      <button onClick={onClearSession} title="Clear session" className="crew-chat-clear-btn">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function SessionErrorBanner({ status }: SessionErrorBannerProps) {
  if (status !== 'error') {
    return null
  }

  return (
    <div
      style={{
        padding: '6px 16px',
        fontSize: '12px',
        color: '#e85d5d',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <AlertCircle size={12} /> Session encountered an error
    </div>
  )
}

export function CrewProjectView({ projectId }: CrewProjectViewProps) {
  const [project, setProject] = useState<CrewProject | null>(null)
  const [session, setSession] = useState<CrewSession | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    const projects: CrewProject[] = await window.crew.listProjects()
    const p = projects.find(pr => pr.id === projectId) ?? null
    setProject(p)
    if (p) {
      const s = await window.crew.getSession(p.id)
      setSession(s)
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.conversationHistory.length])

  const handleStartSession = async () => {
    if (!project) return
    const s = await window.crew.createSession(project.id)
    setSession(s)
  }

  const appendMessageToSession = (msg: CrewChatMessage, status: CrewSession['status']) => {
    setSession(prev =>
      prev
        ? {
            ...prev,
            status,
            conversationHistory: [...prev.conversationHistory, msg],
            updatedAt: Date.now(),
          }
        : prev
    )
  }

  const handleSendMessage = async () => {
    if (!project || !session || !message.trim() || sending) return

    const trimmedMessage = message.trim()

    const userMsg: CrewChatMessage = {
      role: 'user',
      content: trimmedMessage,
      timestamp: Date.now(),
    }

    setSending(true)
    setMessage('')
    appendMessageToSession(userMsg, 'active')

    await window.crew.addMessage(project.id, userMsg)
    await window.crew.updateSessionStatus(project.id, 'active')

    try {
      const response = await window.copilot.chatSend({
        message: trimmedMessage,
        context: `Project: ${project.githubSlug} at ${project.localPath}`,
        conversationHistory:
          session.conversationHistory.map(m => ({
            role: m.role,
            content: m.content,
          })) ?? [],
      })
      const responseContent =
        typeof response === 'string' ? response : (response?.content ?? 'No response received.')

      const assistantMsg: CrewChatMessage = {
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
      }

      await window.crew.addMessage(project.id, assistantMsg)
      await window.crew.updateSessionStatus(project.id, 'idle')
      appendMessageToSession(assistantMsg, 'idle')
    } catch (err) {
      const errorMsg: CrewChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }
      await window.crew.addMessage(project.id, errorMsg)
      await window.crew.updateSessionStatus(project.id, 'error')
      appendMessageToSession(errorMsg, 'error')
    } finally {
      setSending(false)
    }
  }

  const handleClearSession = async () => {
    if (!project) return
    await window.crew.clearSession(project.id)
    setSession(null)
  }

  const handleKeepFile = async (filePath: string) => {
    if (!project || !session) return
    const updated = session.changedFiles.filter(f => f.filePath !== filePath)
    await window.crew.updateChangedFiles(project.id, updated)
    await loadData()
  }

  const handleUndoFile = async (filePath: string) => {
    if (!project || !session) return
    await window.crew.undoFile(project.id, filePath)
    await loadData()
  }

  if (!project) {
    return (
      <div className="content-placeholder">
        <div className="content-body">
          <p>Project not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProjectHeader project={project} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!session ? (
          <SessionStarter onStartSession={handleStartSession} />
        ) : (
          <>
            <ConversationHistory
              conversationHistory={session.conversationHistory}
              sending={sending}
              chatEndRef={chatEndRef}
            />
            <ChangedFilesPanel
              changedFiles={session.changedFiles}
              onKeepFile={handleKeepFile}
              onUndoFile={handleUndoFile}
            />
            <MessageComposer
              message={message}
              sending={sending}
              onMessageChange={setMessage}
              onSendMessage={handleSendMessage}
              onClearSession={handleClearSession}
            />
            <SessionErrorBanner status={session.status} />
          </>
        )}
      </div>
    </div>
  )
}
