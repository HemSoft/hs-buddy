import { RefreshCw, Users } from 'lucide-react'
import type { CopilotSeatInfo } from '../../hooks/useCopilotSeats'

interface TopUsersSectionProps {
  seats: CopilotSeatInfo[]
  loading: boolean
  orgErrors: Array<{ org: string; error: string }>
  truncated: boolean
}

function formatEditor(editor: string | null): string {
  if (!editor) return '—'
  const slash = editor.indexOf('/')
  const name = slash > 0 ? editor.slice(0, slash) : editor
  const map: Record<string, string> = {
    vscode: 'VS Code',
    'visual studio': 'Visual Studio',
    jetbrains: 'JetBrains',
    neovim: 'Neovim',
    vim: 'Vim',
    xcode: 'Xcode',
    eclipse: 'Eclipse',
  }
  return map[name.toLowerCase()] ?? name
}

function formatPlanType(plan: string | null): string {
  if (!plan) return '—'
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

function UserRow({ seat, rank }: { seat: CopilotSeatInfo; rank: number }) {
  return (
    <div className="top-users-row">
      <span className="top-users-rank">{rank}</span>
      <span className="top-users-login" title={seat.login}>
        {seat.displayName || seat.login}
      </span>
      <span className="top-users-org">{seat.org}</span>
      <span className="top-users-requests">
        {seat.premiumRequests !== null ? seat.premiumRequests.toLocaleString() : '—'}
      </span>
      <span className="top-users-plan">{formatPlanType(seat.planType)}</span>
      <span className="top-users-editor">{formatEditor(seat.lastActivityEditor)}</span>
    </div>
  )
}

function OrgErrors({ errors }: { errors: Array<{ org: string; error: string }> }) {
  if (errors.length === 0) return null
  return (
    <div className="top-users-errors">
      {errors.map(({ org, error }) => (
        <p key={org} className="usage-budget-error">
          {org}: {error}
        </p>
      ))}
    </div>
  )
}

function UsersTable({ seats }: { seats: CopilotSeatInfo[] }) {
  if (seats.length === 0) return null
  return (
    <div className="top-users-table">
      <div className="top-users-header">
        <span className="top-users-rank">#</span>
        <span className="top-users-login">User</span>
        <span className="top-users-org">Org</span>
        <span className="top-users-requests">Requests</span>
        <span className="top-users-plan">Plan</span>
        <span className="top-users-editor">Editor</span>
      </div>
      {seats.map((seat, i) => (
        <UserRow key={`${seat.org}/${seat.login}`} seat={seat} rank={i + 1} />
      ))}
    </div>
  )
}

function shouldHideSection(
  seats: CopilotSeatInfo[],
  loading: boolean,
  orgErrorCount: number
): boolean {
  return seats.length === 0 && !loading && orgErrorCount === 0
}

function LoadingIcon({ loading }: { loading: boolean }) {
  return loading ? <RefreshCw size={12} className="spin" /> : null
}

function TruncationWarning({ truncated }: { truncated: boolean }) {
  if (!truncated) return null
  return (
    <p className="top-users-truncated">
      Some orgs have more seats than could be fetched. Showing top 50 from available data.
    </p>
  )
}

export function TopUsersSection({ seats, loading, orgErrors, truncated }: TopUsersSectionProps) {
  if (shouldHideSection(seats, loading, orgErrors.length)) return null

  return (
    <div className="top-users-section">
      <h3 className="usage-budgets-heading">
        <Users size={14} />
        Top Premium Request Users
        <LoadingIcon loading={loading} />
      </h3>

      <OrgErrors errors={orgErrors} />
      <TruncationWarning truncated={truncated} />
      <UsersTable seats={seats} />
    </div>
  )
}
