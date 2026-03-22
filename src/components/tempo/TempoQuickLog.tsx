import { useState } from 'react'
import type { CreateWorklogPayload, TempoQuickLogPreset } from '../../types/tempo'
import { Zap } from 'lucide-react'

const PRESETS: TempoQuickLogPreset[] = [
  { label: 'Meetings', issueKey: 'INT-14', defaultAccount: 'INT', description: 'Company/Team Meetings & Events' },
  { label: 'PE Support', issueKey: 'PE-869', defaultAccount: 'GEN-DEV', description: 'Productivity Engineering Support' },
  { label: 'Relias Assistant', issueKey: 'PE-992', defaultAccount: 'GEN-DEV', description: 'Relias Assistant -- second milestone' },
  { label: 'AI Chapter', issueKey: 'PE-931', defaultAccount: 'GEN-MAINT', description: 'AI Chapter (Foundation & Engineering)' },
  { label: 'Prof. Dev', issueKey: 'INT-5', defaultAccount: 'INT', description: 'Professional Development' },
  { label: 'SFL Dev', issueKey: 'PE-1160', defaultAccount: 'GEN-DEV', description: 'SFL -- Initial Alpha Release' },
  { label: 'PTO / Sick', issueKey: 'INT-8', defaultAccount: 'INT', description: 'Time Off' },
]

interface TempoQuickLogProps {
  onLog: (payload: CreateWorklogPayload) => Promise<unknown>
  pending: boolean
}

export function TempoQuickLog({ onLog, pending }: TempoQuickLogProps) {
  const [hours, setHours] = useState('1')
  const [expanded, setExpanded] = useState(false)

  const handleQuickLog = async (preset: TempoQuickLogPreset) => {
    const h = parseFloat(hours)
    if (isNaN(h) || h <= 0 || h > 24) return
    await onLog({
      issueKey: preset.issueKey,
      hours: h,
      date: new Date().toISOString().slice(0, 10),
      accountKey: preset.defaultAccount,
      description: preset.description,
    })
  }

  return (
    <div className="tempo-quick-log">
      <button
        className="tempo-quick-log-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Zap size={14} />
        <span>Quick Log</span>
        <span className="tempo-quick-log-arrow">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="tempo-quick-log-panel">
          <div className="tempo-quick-log-hours">
            <label>Hours:</label>
            <input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value={hours}
              onChange={e => setHours(e.target.value)}
              className="tempo-quick-log-input"
            />
          </div>
          <div className="tempo-quick-log-presets">
            {PRESETS.map(preset => (
              <button
                key={preset.issueKey}
                className="tempo-quick-log-btn"
                onClick={() => handleQuickLog(preset)}
                disabled={pending}
                title={`${preset.issueKey} · ${preset.description}`}
              >
                <span className="tempo-ql-label">{preset.label}</span>
                <span className="tempo-ql-key">{preset.issueKey}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
