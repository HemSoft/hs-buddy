import { useMemo, useState } from 'react'
import { CalendarClock, Search, Users, X } from 'lucide-react'
import { useCopilotEnterpriseUsers } from '../../hooks/useCopilotEnterpriseUsers'
import type {
  CopilotEnterpriseUser,
  CopilotEnterpriseUsersSnapshot,
} from '../../types/copilotEnterpriseUsers'
import { formatCurrency } from './quotaUtils'

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function SnapshotMeta({ snapshot }: { snapshot: CopilotEnterpriseUsersSnapshot }) {
  return (
    <div className="top-users-meta">
      <span>
        <CalendarClock size={13} />
        Updated {formatUpdatedAt(snapshot.generatedAt)}
      </span>
      {snapshot.organization ? <span>{snapshot.organization}</span> : null}
      <span>{snapshot.totalUsers.toLocaleString()} users</span>
      <span>{snapshot.activeUsers.toLocaleString()} active</span>
    </div>
  )
}

function statusLabel(user: CopilotEnterpriseUser): string {
  if (!user.success) return 'Failed'
  return user.grossQuantity > 0 ? 'Active' : 'No usage'
}

function EnterpriseUserRow({
  user,
  rank,
  onSelect,
}: {
  user: CopilotEnterpriseUser
  rank: number
  onSelect: (user: CopilotEnterpriseUser) => void
}) {
  return (
    <button
      type="button"
      className="enterprise-users-row"
      onClick={() => onSelect(user)}
      title={`View source JSON for ${user.login}`}
    >
      <span className="enterprise-users-rank">{rank}</span>
      <span className="enterprise-users-login" title={user.login}>
        {user.login}
      </span>
      <span className="enterprise-users-credits">{formatCredits(user.grossQuantity)}</span>
      <span className="enterprise-users-money">{formatCurrency(user.grossAmount)}</span>
      <span className="enterprise-users-model-count">{user.modelCount}</span>
      <span className="enterprise-users-model" title={user.topModel ?? undefined}>
        {user.topModel ?? '—'}
      </span>
      <span className="enterprise-users-status">{statusLabel(user)}</span>
    </button>
  )
}

function EnterpriseUsersTable({
  users,
  onSelectUser,
}: {
  users: CopilotEnterpriseUser[]
  onSelectUser: (user: CopilotEnterpriseUser) => void
}) {
  return (
    <div className="enterprise-users-table">
      <div className="enterprise-users-header">
        <span className="enterprise-users-rank">#</span>
        <span className="enterprise-users-login">User</span>
        <span className="enterprise-users-credits">Credits</span>
        <span className="enterprise-users-money">Gross</span>
        <span className="enterprise-users-model-count">Models</span>
        <span className="enterprise-users-model">Top Model</span>
        <span className="enterprise-users-status">Status</span>
      </div>
      {users.map((user, index) => (
        <EnterpriseUserRow key={user.login} user={user} rank={index + 1} onSelect={onSelectUser} />
      ))}
    </div>
  )
}

function EnterpriseUsersFilter({
  value,
  totalUsers,
  visibleUsers,
  onChange,
}: {
  value: string
  totalUsers: number
  visibleUsers: number
  onChange: (value: string) => void
}) {
  return (
    <div className="enterprise-users-filter">
      <label className="enterprise-users-filter-box">
        <Search size={14} />
        <input
          aria-label="Filter Copilot Enterprise users"
          type="search"
          value={value}
          placeholder="Filter users"
          onChange={event => onChange(event.target.value)}
        />
      </label>
      <span className="enterprise-users-filter-count">
        {visibleUsers.toLocaleString()} of {totalUsers.toLocaleString()} users
      </span>
    </div>
  )
}

function filterUsers(users: CopilotEnterpriseUser[], filterText: string) {
  const normalizedFilter = filterText.trim().toLowerCase()
  if (!normalizedFilter) return users

  return users.filter(user => user.login.toLowerCase().includes(normalizedFilter))
}

interface EnterpriseUsersContentProps extends ReturnType<typeof useCopilotEnterpriseUsers> {
  filterText: string
  onSelectUser: (user: CopilotEnterpriseUser) => void
}

function EnterpriseUsersContent({
  data,
  loading,
  error,
  filterText,
  onSelectUser,
}: EnterpriseUsersContentProps) {
  const visibleUsers = useMemo(
    () => (data ? filterUsers(data.users, filterText) : []),
    [data, filterText]
  )

  if (data && visibleUsers.length > 0)
    return <EnterpriseUsersTable users={visibleUsers} onSelectUser={onSelectUser} />
  if (data && data.users.length > 0)
    return <div className="enterprise-users-message">No users match this filter.</div>
  if (loading)
    return <div className="enterprise-users-message">Loading Copilot Enterprise users...</div>
  if (error)
    return <div className="enterprise-users-message enterprise-users-message-error">{error}</div>
  if (data)
    return <div className="enterprise-users-message">No Copilot Enterprise users found.</div>

  return null
}

function SourceJsonModal({
  user,
  sourceFile,
  onClose,
}: {
  user: CopilotEnterpriseUser
  sourceFile: string
  onClose: () => void
}) {
  return (
    <div className="enterprise-users-json-overlay" role="presentation">
      <button
        type="button"
        className="enterprise-users-json-backdrop"
        aria-label="Close source JSON"
        onClick={onClose}
      />
      <div
        className="enterprise-users-json-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enterprise-users-json-title"
      >
        <div className="enterprise-users-json-header">
          <div>
            <h4 id="enterprise-users-json-title">{user.login}</h4>
            <p>{sourceFile}</p>
          </div>
          <button
            type="button"
            className="enterprise-users-json-close"
            aria-label="Close source JSON dialog"
            title="Close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <pre className="enterprise-users-json-block">{user.sourceJson}</pre>
      </div>
    </div>
  )
}

interface TopUsersSectionProps {
  refreshToken?: number
}

export function TopUsersSection({ refreshToken = 0 }: TopUsersSectionProps) {
  const enterpriseUsers = useCopilotEnterpriseUsers(refreshToken)
  const { data } = enterpriseUsers
  const [filterText, setFilterText] = useState('')
  const [selectedUser, setSelectedUser] = useState<CopilotEnterpriseUser | null>(null)
  const visibleUsers = data ? filterUsers(data.users, filterText).length : 0

  return (
    <div className="top-users-section">
      <h3 className="usage-budgets-heading">
        <Users size={14} />
        Copilot Enterprise Users
      </h3>
      {data ? <SnapshotMeta snapshot={data} /> : null}
      {data && data.users.length > 0 ? (
        <EnterpriseUsersFilter
          value={filterText}
          totalUsers={data.users.length}
          visibleUsers={visibleUsers}
          onChange={setFilterText}
        />
      ) : null}
      <EnterpriseUsersContent
        {...enterpriseUsers}
        filterText={filterText}
        onSelectUser={setSelectedUser}
      />
      {selectedUser && data ? (
        <SourceJsonModal
          user={selectedUser}
          sourceFile={data.sourceFile}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
    </div>
  )
}
