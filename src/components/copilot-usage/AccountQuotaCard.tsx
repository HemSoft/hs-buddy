import {
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Building2,
  Crown,
  Briefcase,
  TrendingUp,
} from 'lucide-react'
import { UsageRing } from './UsageRing'
import {
  OVERAGE_COST_PER_REQUEST,
  formatCurrency,
  computeProjection,
  type AccountQuotaState,
} from './quotaUtils'
import type { GitHubAccount } from '../../types/config'
import { daysUntilReset, formatCopilotPlan, formatResetDate } from '../../utils/copilotFormatUtils'
import { formatTime } from '../../utils/dateUtils'

const INITIAL_QUOTA_STATE: AccountQuotaState = {
  data: null,
  loading: true,
  error: null,
  fetchedAt: null,
}

interface AccountQuotaCardProps {
  account: GitHubAccount
  state: AccountQuotaState | undefined
}

function PlanIcon({ plan }: { plan: string }) {
  if (plan === 'enterprise') return <Building2 size={13} />
  if (plan === 'business') return <Briefcase size={13} />
  return <Crown size={13} />
}

interface QuotaMetrics {
  percentUsed: number
  used: number
  total: number
  overageRequests: number
  overageCost: number
}

const PREMIUM_DEFAULTS = { percent_remaining: 100, entitlement: 0, remaining: 0, overage_count: 0 }

function computeQuotaMetrics(
  premium: NonNullable<AccountQuotaState['data']>['quota_snapshots']['premium_interactions']
): QuotaMetrics {
  const p = { ...PREMIUM_DEFAULTS, ...premium }
  const percentUsed = 100 - p.percent_remaining
  const used = p.entitlement - p.remaining
  const total = p.entitlement
  const overageByCount = Math.max(0, p.overage_count)
  const overageByRemaining = Math.max(0, -p.remaining)
  const overageRequests = Math.max(overageByCount, overageByRemaining)
  const overageCost = overageRequests * OVERAGE_COST_PER_REQUEST
  return { percentUsed, used, total, overageRequests, overageCost }
}

function QuotaProjectionView({ projection }: { projection: ReturnType<typeof computeProjection> }) {
  /* v8 ignore start */
  if (!projection) return null
  /* v8 ignore stop */
  return (
    <div className="usage-projection">
      <div className="usage-projection-header">
        <TrendingUp size={12} />
        <span>Month-End Projection</span>
      </div>
      <div className="usage-projection-stats">
        <div className="usage-projection-stat">
          <span className="usage-projection-value">
            {projection.projectedTotal.toLocaleString()}
          </span>
          <span className="usage-projection-label">Projected</span>
        </div>
        <div className="usage-projection-stat">
          <span className="usage-projection-value">
            {Math.round(projection.dailyRate).toLocaleString()}
          </span>
          <span className="usage-projection-label">Per Day</span>
        </div>
        {projection.projectedOverage > 0 && (
          <div className="usage-projection-stat usage-projection-overage">
            <span className="usage-projection-value">
              {formatCurrency(projection.projectedOverageCost)}
            </span>
            <span className="usage-projection-label">Est. Overage</span>
          </div>
        )}
      </div>
    </div>
  )
}

function QuotaFooter({
  state,
  data,
}: {
  state: AccountQuotaState
  data: NonNullable<AccountQuotaState['data']>
}) {
  return (
    <div className="usage-account-footer">
      <div className="usage-account-reset">
        Resets {formatResetDate(data.quota_reset_date_utc, true)}
        <span className="usage-reset-days">({daysUntilReset(data.quota_reset_date_utc)}d)</span>
      </div>
      <div className="usage-account-links">
        {state?.fetchedAt && (
          <span className="usage-fetched-at">{formatTime(state.fetchedAt)}</span>
        )}
        <button
          className="usage-link-btn"
          /* v8 ignore start */
          onClick={() => window.shell.openExternal('https://github.com/settings/copilot')}
          /* v8 ignore stop */
          title="Open Copilot settings on GitHub"
        >
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function QuotaDataView({
  state,
  data,
  premium,
  metrics,
  projection,
}: {
  state: AccountQuotaState
  data: NonNullable<AccountQuotaState['data']>
  premium: NonNullable<AccountQuotaState['data']>['quota_snapshots']['premium_interactions']
  metrics: QuotaMetrics
  projection: ReturnType<typeof computeProjection>
}) {
  return (
    <>
      <div className="usage-account-header">
        <div className="usage-account-identity">
          <span className="usage-account-name">{data.login}</span>
          <span className="usage-account-plan">
            <PlanIcon plan={data.copilot_plan} />
            {formatCopilotPlan(data.copilot_plan)}
          </span>
        </div>
        {/* v8 ignore start */}
        {state?.loading && <RefreshCw size={12} className="spin" />}
        {/* v8 ignore stop */}
      </div>

      <div className="usage-account-body">
        <UsageRing
          percentUsed={metrics.percentUsed}
          projectedPercent={projection?.projectedPercent}
          size={110}
          strokeWidth={9}
        />
        <div className="usage-account-stats" data-testid="quota-stats">
          <div className="usage-stat">
            <span className="usage-stat-value">{metrics.used.toLocaleString()}</span>
            <span className="usage-stat-label">Used</span>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-value">{premium.remaining.toLocaleString()}</span>
            <span className="usage-stat-label">Remaining</span>
          </div>
          <div className="usage-stat">
            <span className="usage-stat-value">{metrics.total.toLocaleString()}</span>
            <span className="usage-stat-label">Entitlement</span>
          </div>
          {metrics.overageRequests > 0 && (
            <div className="usage-stat usage-stat-overage">
              <span className="usage-stat-value">{formatCurrency(metrics.overageCost)}</span>
              <span className="usage-stat-label">Overage Cost</span>
            </div>
          )}
        </div>
      </div>

      <QuotaProjectionView projection={projection} />
      <QuotaFooter state={state} data={data} />

      {data.organization_login_list.length > 0 && (
        <div className="usage-account-orgs">
          <Building2 size={11} />
          <span>{data.organization_login_list.join(', ')}</span>
        </div>
      )}
    </>
  )
}

interface QuotaViewData {
  data: NonNullable<AccountQuotaState['data']>
  premium: NonNullable<AccountQuotaState['data']>['quota_snapshots']['premium_interactions']
  metrics: QuotaMetrics
  projection: ReturnType<typeof computeProjection>
}

function prepareQuotaViewData(state: AccountQuotaState): QuotaViewData | null {
  const data = state.data
  const premium = data?.quota_snapshots?.premium_interactions
  if (!data || !premium) return null
  const metrics = computeQuotaMetrics(premium)
  const projection = computeProjection(premium, data.quota_reset_date_utc)
  return { data, premium, metrics, projection }
}

function QuotaLoadingView() {
  return (
    <div className="usage-account-loading">
      <RefreshCw size={16} className="spin" />
      <span>Loading...</span>
    </div>
  )
}

function QuotaErrorView({ username, error }: { username: string; error: string }) {
  return (
    <div className="usage-account-error">
      <AlertCircle size={16} />
      <div>
        <strong>{username}</strong>
        <p>{error.includes('404') ? 'No Copilot subscription' : 'Failed to load'}</p>
      </div>
    </div>
  )
}

function isLoadingWithoutData(loading: boolean, data: unknown): boolean {
  return loading && !data
}

export function AccountQuotaCard({ account, state: rawState }: AccountQuotaCardProps) {
  const state = rawState ?? INITIAL_QUOTA_STATE
  const quotaView = prepareQuotaViewData(state)
  const showLoading = isLoadingWithoutData(state.loading, state.data)
  const showError = !!state.error && !state.data

  return (
    <div className="usage-account-card">
      {showLoading && <QuotaLoadingView />}

      {showError && <QuotaErrorView username={account.username} error={state.error!} />}

      {quotaView && (
        <QuotaDataView
          state={state}
          data={quotaView.data}
          premium={quotaView.premium}
          metrics={quotaView.metrics}
          projection={quotaView.projection}
        />
      )}
    </div>
  )
}
