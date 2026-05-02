import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, Cpu, Hash, Zap, BarChart3 } from 'lucide-react'
import { useCopilotSessionDetail } from '../../hooks/useCopilotSessions'
import type { SessionRequestResult, SessionDigest } from '../../types/copilotSession'
import './SessionDetail.css'

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`
  const s = ms / 1_000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = s / 60
  if (m < 60) return `${m.toFixed(1)}m`
  return `${(m / 60).toFixed(1)}h`
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function getRequestKey(result: SessionRequestResult, occurrence: number): string {
  return [
    result.prompt,
    result.promptTokens,
    result.outputTokens,
    result.firstProgressMs,
    result.totalElapsedMs,
    result.toolCallCount,
    result.toolNames.join('|'),
    occurrence,
  ].join('::')
}

function RequestItem({ result, index }: { result: SessionRequestResult; index: number }) {
  return (
    <div className="session-request-item">
      <span className="session-request-index">#{index + 1}</span>
      <div className="session-request-body">
        {result.prompt && <div className="session-request-prompt">{result.prompt}</div>}
        <div className="session-request-tokens">
          <span>↑ {formatTokenCount(result.promptTokens)} prompt</span>
          <span>↓ {formatTokenCount(result.outputTokens)} output</span>
          {result.totalElapsedMs > 0 && <span>{formatDuration(result.totalElapsedMs)}</span>}
        </div>
        {result.toolNames.length > 0 && (
          <div className="session-request-tools">
            {result.toolNames.join(', ')}
            {result.toolCallCount > result.toolNames.length && ` (${result.toolCallCount} calls)`}
          </div>
        )}
      </div>
    </div>
  )
}

interface SessionDetailProps {
  filePath: string
  onBack: () => void
}

function SessionMetaGrid({
  requestCount,
  totalPromptTokens,
  totalOutputTokens,
  totalToolCalls,
  totalDurationMs,
}: {
  requestCount: number
  totalPromptTokens: number
  totalOutputTokens: number
  totalToolCalls: number
  totalDurationMs: number
}) {
  return (
    <div className="session-detail-meta-grid">
      <div className="session-detail-meta-card">
        <div className="session-detail-meta-label">
          <Hash size={11} /> Requests
        </div>
        <div className="session-detail-meta-value">{requestCount}</div>
      </div>
      <div className="session-detail-meta-card">
        <div className="session-detail-meta-label">
          <Zap size={11} /> Prompt Tokens
        </div>
        <div className="session-detail-meta-value">{formatTokenCount(totalPromptTokens)}</div>
      </div>
      <div className="session-detail-meta-card">
        <div className="session-detail-meta-label">
          <Zap size={11} /> Output Tokens
        </div>
        <div className="session-detail-meta-value">{formatTokenCount(totalOutputTokens)}</div>
      </div>
      <div className="session-detail-meta-card">
        <div className="session-detail-meta-label">
          <Cpu size={11} /> Tool Calls
        </div>
        <div className="session-detail-meta-value">{totalToolCalls}</div>
      </div>
      <div className="session-detail-meta-card">
        <div className="session-detail-meta-label">
          <Clock size={11} /> Duration
        </div>
        <div className="session-detail-meta-value">{formatDuration(totalDurationMs)}</div>
      </div>
    </div>
  )
}

function SessionDigestSection({
  digest,
  digestLoading,
  onComputeDigest,
}: {
  digest: SessionDigest | null
  digestLoading: boolean
  onComputeDigest: () => void
}) {
  return (
    <div className="session-digest-section">
      {!digest ? (
        <button className="session-digest-btn" onClick={onComputeDigest} disabled={digestLoading}>
          <BarChart3 size={14} /> {digestLoading ? 'Computing…' : 'Compute Efficiency Digest'}
        </button>
      ) : (
        <div className="session-digest-grid">
          <div className="session-digest-card">
            <div className="session-detail-meta-label">Token Efficiency</div>
            <div className="session-detail-meta-value">{digest.tokenEfficiency.toFixed(2)}</div>
            <div className="session-digest-hint">output / prompt ratio</div>
          </div>
          <div className="session-digest-card">
            <div className="session-detail-meta-label">Tool Density</div>
            <div className="session-detail-meta-value">{digest.toolDensity.toFixed(1)}</div>
            <div className="session-digest-hint">tools per request</div>
          </div>
          <div className="session-digest-card">
            <div className="session-detail-meta-label">Search Churn</div>
            <div
              className={`session-detail-meta-value ${digest.searchChurn > 10 ? 'session-digest-warn' : ''}`}
            >
              {digest.searchChurn}
            </div>
            <div className="session-digest-hint">requests with search tools</div>
          </div>
          <div className="session-digest-card">
            <div className="session-detail-meta-label">~Cost</div>
            <div className="session-detail-meta-value">${digest.estimatedCost.toFixed(4)}</div>
            <div className="session-digest-hint">rough estimate</div>
          </div>
          {digest.dominantTools.length > 0 && (
            <div className="session-digest-card session-digest-wide">
              <div className="session-detail-meta-label">Dominant Tools</div>
              <div className="session-digest-tools">{digest.dominantTools.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SessionSubtitle({
  session,
}: {
  session: { startTime: number; model?: { name?: string; id?: string; multiplier?: string } | null }
}) {
  return (
    <div className="session-detail-subtitle">
      <span>{formatDate(session.startTime)}</span>
      {session.model && <span>{session.model.name || session.model.id}</span>}
      {session.model?.multiplier && <span>{session.model.multiplier}</span>}
    </div>
  )
}

function SessionRequestTimeline({
  requestItems,
}: {
  requestItems: { key: string; result: SessionRequestResult }[]
}) {
  /* v8 ignore start */
  if (requestItems.length === 0) return null
  /* v8 ignore stop */
  return (
    <div className="session-detail-requests">
      <h3>Request Timeline ({requestItems.length} results)</h3>
      {requestItems.map(({ key, result }, index) => (
        <RequestItem key={key} result={result} index={index} />
      ))}
    </div>
  )
}

export function SessionDetail({ filePath, onBack }: SessionDetailProps) {
  const { session, isLoading, error, load } = useCopilotSessionDetail()
  const [digest, setDigest] = useState<SessionDigest | null>(null)
  const [digestLoading, setDigestLoading] = useState(false)

  useEffect(() => {
    load(filePath)
    setDigest(null)
  }, [filePath, load])

  const computeDigest = async () => {
    setDigestLoading(true)
    const targetPath = filePath
    try {
      const result = await window.copilotSessions.computeDigest(filePath)
      // Guard against stale result if user navigated away during computation
      /* v8 ignore start */
      if (targetPath === filePath) {
        /* v8 ignore stop */
        setDigest(result)
      }
    } catch (err: unknown) {
      console.error('Failed to compute digest:', err)
    } finally {
      setDigestLoading(false)
    }
  }

  if (isLoading) return <div className="session-detail-loading">Loading session…</div>
  if (error) return <div className="session-detail-error">{error}</div>
  if (!session) return <div className="session-detail-loading">Session not found.</div>

  const requestOccurrences = new Map<string, number>()
  const requestItems = session.results.map(result => {
    const signature = [
      result.prompt,
      result.promptTokens,
      result.outputTokens,
      result.firstProgressMs,
      result.totalElapsedMs,
      result.toolCallCount,
      result.toolNames.join('|'),
    ].join('::')
    const occurrence = requestOccurrences.get(signature) ?? 0
    requestOccurrences.set(signature, occurrence + 1)

    return {
      key: getRequestKey(result, occurrence),
      result,
    }
  })

  return (
    <div className="session-detail">
      <button className="session-detail-back" onClick={onBack}>
        <ArrowLeft size={14} /> Back to Sessions
      </button>

      <h2 className="session-detail-title">
        {session.title || `Session ${session.sessionId.slice(0, 8)}`}
      </h2>
      <SessionSubtitle session={session} />

      <SessionMetaGrid
        requestCount={session.requestCount}
        totalPromptTokens={session.totalPromptTokens}
        totalOutputTokens={session.totalOutputTokens}
        totalToolCalls={session.totalToolCalls}
        totalDurationMs={session.totalDurationMs}
      />

      <SessionDigestSection
        digest={digest}
        digestLoading={digestLoading}
        onComputeDigest={computeDigest}
      />

      {session.toolsUsed.length > 0 && (
        <div className="session-tools-section">
          <h3>Tools Used</h3>
          <div className="session-tools-list">
            {session.toolsUsed.map(tool => (
              <span key={tool} className="session-tool-badge">
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {session.results.length > 0 && <SessionRequestTimeline requestItems={requestItems} />}
    </div>
  )
}
