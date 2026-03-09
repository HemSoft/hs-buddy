import { useState, useEffect, useCallback, useRef } from 'react'
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

interface CrewProjectViewProps {
  projectId: string
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
    setSession(prev =>
      prev
        ? {
            ...prev,
            status: 'active',
            conversationHistory: [...prev.conversationHistory, userMsg],
            updatedAt: Date.now(),
          }
        : prev
    )

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
      setSession(prev =>
        prev
          ? {
              ...prev,
              status: 'idle',
              conversationHistory: [...prev.conversationHistory, assistantMsg],
              updatedAt: Date.now(),
            }
          : prev
      )
    } catch (err) {
      const errorMsg: CrewChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }
      await window.crew.addMessage(project.id, errorMsg)
      await window.crew.updateSessionStatus(project.id, 'error')
      setSession(prev =>
        prev
          ? {
              ...prev,
              status: 'error',
              conversationHistory: [...prev.conversationHistory, errorMsg],
              updatedAt: Date.now(),
            }
          : prev
      )
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
      {/* Project header */}
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

      {/* Session area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!session ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              onClick={handleStartSession}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--accent-primary, #0e639c)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <Plus size={16} /> Start Session
            </button>
          </div>
        ) : (
          <>
            {/* Conversation history */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {session.conversationHistory.length === 0 && (
                <div style={{ textAlign: 'center', opacity: 0.5, padding: '24px' }}>
                  <p>Send a message to start the conversation.</p>
                </div>
              )}
              {session.conversationHistory.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  style={{
                    marginBottom: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background:
                      msg.role === 'user'
                        ? 'var(--accent-primary, #0e639c)22'
                        : 'var(--bg-secondary, #252526)',
                    borderLeft:
                      msg.role === 'assistant'
                        ? '3px solid var(--accent-primary, #0e639c)'
                        : 'none',
                  }}
                >
                  <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '4px' }}>
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

            {/* Changed files panel */}
            {session.changedFiles.length > 0 && (
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
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    opacity: 0.7,
                    textTransform: 'uppercase',
                  }}
                >
                  Changed Files
                </div>
                {session.changedFiles.map(file => (
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
                        onClick={() => handleKeepFile(file.filePath)}
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
                        onClick={() => handleUndoFile(file.filePath)}
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
            )}

            {/* Input area */}
            <div
              style={{
                borderTop: '1px solid var(--bg-secondary, #333)',
                padding: '12px 16px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-end',
              }}
            >
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Ask Copilot about this project…"
                rows={2}
                disabled={sending}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'var(--bg-secondary, #252526)',
                  color: 'inherit',
                  border: '1px solid var(--bg-secondary, #333)',
                  borderRadius: '4px',
                  padding: '8px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={sending || !message.trim()}
                style={{
                  background: 'var(--accent-primary, #0e639c)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px',
                  cursor: sending || !message.trim() ? 'default' : 'pointer',
                  opacity: sending || !message.trim() ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Send size={16} />
              </button>
              <button
                onClick={handleClearSession}
                title="Clear session"
                style={{
                  background: 'none',
                  color: 'inherit',
                  border: '1px solid var(--bg-secondary, #333)',
                  borderRadius: '4px',
                  padding: '8px',
                  cursor: 'pointer',
                  opacity: 0.6,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Session status */}
            {session.status === 'error' && (
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
            )}
          </>
        )}
      </div>
    </div>
  )
}
