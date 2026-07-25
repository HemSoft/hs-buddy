import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Braces,
  CheckCircle2,
  CircleDollarSign,
  Cpu,
  FileJson,
  Gauge,
  Layers3,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'
import type {
  CopilotEnterpriseUser,
  CopilotEnterpriseUsersSnapshot,
} from '../../types/copilotEnterpriseUsers'
import { formatCurrency } from './quotaUtils'

type DetailView = 'overview' | 'json'

interface UsageItem {
  day: number | null
  model: string | null
  grossQuantity: number
  grossAmount: number
  netAmount: number
}

interface ModelUsage {
  model: string
  quantity: number
  amount: number
}

interface DayUsage {
  day: number
  quantity: number
  amount: number
}

interface SourceSummary {
  modelUsage: ModelUsage[]
  dayUsage: DayUsage[]
  parseError: string | null
}

interface CopilotUserDetailsModalProps {
  user: CopilotEnterpriseUser
  snapshot: CopilotEnterpriseUsersSnapshot
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
const SOURCE_KEYS = [
  'Responses',
  'responses',
  'Response',
  'response',
  'usageItems',
  'UsageItems',
  'items',
  'Items',
  'data',
  'Data',
  'Raw',
  'raw',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function readUsageItem(record: Record<string, unknown>, day: number | null): UsageItem | null {
  const grossQuantity = readNumber(record, 'grossQuantity', 'GrossQuantity', 'gross_quantity')
  const model = readString(record, 'model', 'Model')
  if (grossQuantity === null) return null

  return {
    day,
    model,
    grossQuantity,
    grossAmount: readNumber(record, 'grossAmount', 'GrossAmount', 'gross_amount') ?? 0,
    netAmount: readNumber(record, 'netAmount', 'NetAmount', 'net_amount') ?? 0,
  }
}

function collectUsageItems(value: unknown, inheritedDay: number | null, items: UsageItem[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectUsageItems(entry, inheritedDay, items)
    return
  }
  if (!isRecord(value)) return

  const day = readNumber(value, 'Day', 'day') ?? inheritedDay
  const usageItem = readUsageItem(value, day)
  if (usageItem) {
    items.push(usageItem)
    return
  }

  for (const key of SOURCE_KEYS) {
    if (value[key] !== undefined) collectUsageItems(value[key], day, items)
  }
}

function summarizeModels(items: UsageItem[]): ModelUsage[] {
  const models = new Map<string, ModelUsage>()
  for (const item of items) {
    if (!item.model) continue
    const current = models.get(item.model) ?? { model: item.model, quantity: 0, amount: 0 }
    current.quantity += item.grossQuantity
    current.amount += item.grossAmount
    models.set(item.model, current)
  }
  return [...models.values()].sort((a, b) => b.quantity - a.quantity)
}

function summarizeDays(items: UsageItem[]): DayUsage[] {
  const days = new Map<number, DayUsage>()
  for (const item of items) {
    if (item.day === null) continue
    const current = days.get(item.day) ?? { day: item.day, quantity: 0, amount: 0 }
    current.quantity += item.grossQuantity
    current.amount += item.grossAmount
    days.set(item.day, current)
  }
  return [...days.values()].sort((a, b) => a.day - b.day)
}

function summarizeSource(sourceJson: string): SourceSummary {
  try {
    const source: unknown = JSON.parse(sourceJson)
    if (!isRecord(source)) {
      return { modelUsage: [], dayUsage: [], parseError: 'Source JSON is not an object.' }
    }

    const items: UsageItem[] = []
    collectUsageItems(source, null, items)
    return {
      modelUsage: summarizeModels(items),
      dayUsage: summarizeDays(items),
      parseError: null,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parsing error'
    return { modelUsage: [], dayUsage: [], parseError: `Unable to parse source JSON: ${message}` }
  }
}

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function getPeriodLabel(snapshot: CopilotEnterpriseUsersSnapshot): string {
  if (snapshot.year === null || snapshot.month === null) return 'Current reporting period'
  const date = new Date(snapshot.year, snapshot.month - 1, 1)
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function getTopModelShare(user: CopilotEnterpriseUser): number {
  if (user.grossQuantity <= 0) return 0
  return Math.min(100, Math.max(0, (user.topModelQuantity / user.grossQuantity) * 100))
}

function getFocusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element => !element.hasAttribute('disabled') && element.tabIndex >= 0
  )
}

function trapDialogFocus(event: globalThis.KeyboardEvent, dialog: HTMLDialogElement): void {
  if (event.key !== 'Tab') return
  const focusableElements = getFocusableElements(dialog)
  if (focusableElements.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

function DetailViewToggle({
  view,
  onChange,
}: {
  view: DetailView
  onChange: (view: DetailView) => void
}) {
  return (
    <div className="enterprise-user-view-toggle" role="tablist" aria-label="User details view">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'overview'}
        className={view === 'overview' ? 'is-active' : undefined}
        onClick={() => onChange('overview')}
      >
        <Sparkles size={13} />
        Overview
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'json'}
        className={view === 'json' ? 'is-active' : undefined}
        onClick={() => onChange('json')}
      >
        <Braces size={13} />
        JSON
      </button>
    </div>
  )
}

function UserMetricCards({
  user,
  activeDays,
}: {
  user: CopilotEnterpriseUser
  activeDays: number
}) {
  const averagePerActiveDay = activeDays > 0 ? user.grossQuantity / activeDays : null
  return (
    <div className="enterprise-user-metrics" aria-label="Usage summary">
      <article>
        <span className="enterprise-user-metric-icon is-teal">
          <Gauge size={15} />
        </span>
        <div>
          <p>AI credits</p>
          <strong>{formatCredits(user.grossQuantity)}</strong>
        </div>
      </article>
      <article>
        <span className="enterprise-user-metric-icon is-gold">
          <CircleDollarSign size={15} />
        </span>
        <div>
          <p>Gross spend</p>
          <strong>{formatCurrency(user.grossAmount)}</strong>
        </div>
      </article>
      <article>
        <span className="enterprise-user-metric-icon is-blue">
          <Layers3 size={15} />
        </span>
        <div>
          <p>Models used</p>
          <strong>{user.modelCount.toLocaleString()}</strong>
        </div>
      </article>
      <article>
        <span className="enterprise-user-metric-icon is-coral">
          <TrendingUp size={15} />
        </span>
        <div>
          <p>Avg. active day</p>
          <strong>{averagePerActiveDay === null ? '—' : formatCredits(averagePerActiveDay)}</strong>
        </div>
      </article>
    </div>
  )
}

function ModelMix({ user, models }: { user: CopilotEnterpriseUser; models: ModelUsage[] }) {
  const fallbackModels =
    models.length === 0 && user.topModel
      ? [{ model: user.topModel, quantity: user.topModelQuantity, amount: user.grossAmount }]
      : models
  const maximum = Math.max(...fallbackModels.map(model => model.quantity), 1)

  return (
    <section className="enterprise-user-insight-card enterprise-user-model-card">
      <div className="enterprise-user-card-heading">
        <span>
          <Cpu size={15} />
        </span>
        <div>
          <h5>Model mix</h5>
          <p>Credit distribution by model</p>
        </div>
      </div>
      {fallbackModels.length > 0 ? (
        <div className="enterprise-user-model-list">
          {fallbackModels.map((model, index) => (
            <div className="enterprise-user-model-row" key={model.model}>
              <div className="enterprise-user-model-label">
                <span className={`enterprise-user-model-dot hue-${(index % 4) + 1}`} />
                <strong title={model.model}>{model.model}</strong>
                <span>{formatCredits(model.quantity)}</span>
              </div>
              <div className="enterprise-user-model-track" aria-hidden="true">
                <span
                  className={`hue-${(index % 4) + 1}`}
                  style={{ width: `${(model.quantity / maximum) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="enterprise-user-empty-insight">No model usage recorded for this period.</p>
      )}
    </section>
  )
}

function DailyActivity({ days }: { days: DayUsage[] }) {
  const maximum = Math.max(...days.map(day => day.quantity), 1)
  return (
    <section className="enterprise-user-insight-card enterprise-user-activity-card">
      <div className="enterprise-user-card-heading">
        <span>
          <Activity size={15} />
        </span>
        <div>
          <h5>Daily rhythm</h5>
          <p>Credits consumed across reporting days</p>
        </div>
      </div>
      {days.length > 0 ? (
        <div className="enterprise-user-day-chart" aria-label="Daily credit usage">
          {days.map(day => (
            <div className="enterprise-user-day-column" key={day.day}>
              <span className="enterprise-user-day-value">{formatCredits(day.quantity)}</span>
              <div className="enterprise-user-day-track">
                <span style={{ height: `${Math.max(8, (day.quantity / maximum) * 100)}%` }} />
              </div>
              <span className="enterprise-user-day-label">D{day.day}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="enterprise-user-empty-insight">
          Daily activity is not included in this source record.
        </p>
      )}
    </section>
  )
}

function DataProvenance({
  user,
  snapshot,
  activeDays,
}: {
  user: CopilotEnterpriseUser
  snapshot: CopilotEnterpriseUsersSnapshot
  activeDays: number
}) {
  return (
    <section className="enterprise-user-insight-card enterprise-user-provenance-card">
      <div className="enterprise-user-card-heading">
        <span>
          <FileJson size={15} />
        </span>
        <div>
          <h5>Data provenance</h5>
          <p>Collection health and reporting context</p>
        </div>
      </div>
      <dl className="enterprise-user-provenance-list">
        <div>
          <dt>Collection</dt>
          <dd className={user.success ? 'is-success' : 'is-error'}>
            {user.success ? <CheckCircle2 size={13} /> : <X size={13} />}
            {user.success ? 'Successful' : 'Failed'}
          </dd>
        </div>
        <div>
          <dt>Active days</dt>
          <dd>{activeDays.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Organization</dt>
          <dd>{snapshot.organization || 'Not provided'}</dd>
        </div>
        <div>
          <dt>Enterprise</dt>
          <dd>{snapshot.enterprise || 'Not provided'}</dd>
        </div>
      </dl>
      {user.errorMessage ? (
        <p className="enterprise-user-source-error">{user.errorMessage}</p>
      ) : null}
    </section>
  )
}

function UserOverview({
  user,
  snapshot,
  sourceSummary,
}: {
  user: CopilotEnterpriseUser
  snapshot: CopilotEnterpriseUsersSnapshot
  sourceSummary: SourceSummary
}) {
  const activeDays = sourceSummary.dayUsage.filter(day => day.quantity > 0).length
  const topModelShare = getTopModelShare(user)
  const ringStyle = { '--top-model-share': `${topModelShare * 3.6}deg` } as React.CSSProperties

  return (
    <div className="enterprise-user-overview" role="tabpanel">
      <section className="enterprise-user-hero">
        <div className="enterprise-user-hero-copy">
          <span className="enterprise-user-eyebrow">AI credit footprint</span>
          <strong>{formatCredits(user.grossQuantity)}</strong>
          <p>
            {getPeriodLabel(snapshot)} · {activeDays || snapshot.days.length} tracked days
          </p>
        </div>
        <div className="enterprise-user-top-model">
          <div className="enterprise-user-share-ring" style={ringStyle}>
            <span>{formatPercent(topModelShare)}</span>
          </div>
          <div>
            <span>Top model share</span>
            <strong>{user.topModel ?? 'No model usage'}</strong>
            <p>{formatCredits(user.topModelQuantity)} credits</p>
          </div>
        </div>
      </section>

      <UserMetricCards user={user} activeDays={activeDays} />

      {sourceSummary.parseError ? (
        <div className="enterprise-user-parse-error">{sourceSummary.parseError}</div>
      ) : null}

      <div className="enterprise-user-insights">
        <ModelMix user={user} models={sourceSummary.modelUsage} />
        <DailyActivity days={sourceSummary.dayUsage} />
        <DataProvenance user={user} snapshot={snapshot} activeDays={activeDays} />
      </div>
    </div>
  )
}

export function CopilotUserDetailsModal({ user, snapshot, onClose }: CopilotUserDetailsModalProps) {
  const [view, setView] = useState<DetailView>('overview')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sourceSummary = useMemo(() => summarizeSource(user.sourceJson), [user.sourceJson])

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.stopImmediatePropagation()
        onClose()
        return
      }
      trapDialogFocus(event, dialog)
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="enterprise-users-json-overlay" role="presentation">
      <button
        type="button"
        className="enterprise-users-json-backdrop"
        aria-label="Close user details"
        tabIndex={-1}
        onClick={onClose}
      />
      <dialog
        open
        ref={dialogRef}
        className="enterprise-users-json-modal enterprise-user-details-modal"
        aria-modal="true"
        aria-labelledby="enterprise-user-details-title"
        tabIndex={-1}
      >
        <header className="enterprise-user-details-header">
          <div className="enterprise-user-identity">
            <span className="enterprise-user-avatar" aria-hidden="true">
              <UserRound size={22} />
            </span>
            <div>
              <span className="enterprise-user-kicker">Copilot enterprise dossier</span>
              <h4 id="enterprise-user-details-title">{user.login}</h4>
              <p>
                {snapshot.organization || snapshot.enterprise || 'Enterprise account'} ·{' '}
                {getPeriodLabel(snapshot)}
              </p>
            </div>
          </div>
          <div className="enterprise-user-header-actions">
            <span className={`enterprise-user-status ${user.success ? 'is-active' : 'is-failed'}`}>
              <span />
              {user.success ? (user.grossQuantity > 0 ? 'Active' : 'No usage') : 'Failed'}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              className="enterprise-users-json-close"
              aria-label="Close user details dialog"
              title="Close"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="enterprise-user-details-toolbar">
          <DetailViewToggle view={view} onChange={setView} />
          <span className="enterprise-user-source-path" title={snapshot.sourceFile}>
            <FileJson size={12} />
            {snapshot.sourceFile}
          </span>
        </div>

        {view === 'overview' ? (
          <UserOverview user={user} snapshot={snapshot} sourceSummary={sourceSummary} />
        ) : (
          <pre className="enterprise-users-json-block" role="tabpanel">
            {user.sourceJson}
          </pre>
        )}
      </dialog>
    </div>
  )
}
