import { useState, useEffect, useCallback, useMemo } from 'react'
import { getErrorMessage } from '../utils/errorUtils'

export interface CopilotSeatInfo {
  login: string
  displayName: string | null
  org: string
  planType: string | null
  lastActivityAt: string | null
  lastActivityEditor: string | null
  createdAt: string | null
  pendingCancellation: string | null
  premiumRequests: number | null
  lastPremiumRequestDate: string | null
}

interface OrgSeatsResult {
  org: string
  seats: CopilotSeatInfo[]
  totalSeats: number
  fetchedSeats: number
  error: string | null
}

interface CopilotSeatsState {
  seats: CopilotSeatInfo[]
  loading: boolean
  orgErrors: Array<{ org: string; error: string }>
  truncated: boolean
}

const EMPTY_SEATS_STATE: CopilotSeatsState = {
  seats: [],
  loading: false,
  orgErrors: [],
  truncated: false,
}

function sortByPremiumRequests(a: CopilotSeatInfo, b: CopilotSeatInfo): number {
  const aReqs = a.premiumRequests ?? 0
  const bReqs = b.premiumRequests ?? 0
  return bReqs - aReqs
}

async function fetchOrgSeats(org: string, username: string): Promise<OrgSeatsResult> {
  const result = await window.github.getCopilotSeats(org, username)
  if (!result.success || !result.data) {
    return { org, seats: [], totalSeats: 0, fetchedSeats: 0, error: result.error ?? null }
  }

  return {
    org,
    seats: result.data.seats.map(seat => ({
      ...seat,
      org,
      premiumRequests: null,
      lastPremiumRequestDate: null,
    })),
    totalSeats: result.data.totalSeats,
    fetchedSeats: result.data.fetchedSeats,
    error: null,
  }
}

function collectSeatResults(settled: PromiseSettledResult<OrgSeatsResult>[]) {
  const seats: CopilotSeatInfo[] = []
  const orgErrors: Array<{ org: string; error: string }> = []
  let truncated = false

  for (const result of settled) {
    if (result.status === 'rejected') {
      orgErrors.push({ org: 'unknown', error: getErrorMessage(result.reason) })
      continue
    }

    seats.push(...result.value.seats)
    if (result.value.error) {
      orgErrors.push({ org: result.value.org, error: result.value.error })
    }
    if (result.value.fetchedSeats < result.value.totalSeats) {
      truncated = true
    }
  }

  return { seats, orgErrors, truncated }
}

type PremiumUsageData = Record<string, { requests: number; lastActiveDate: string | null }>

function hasPremiumUsageData(data: PremiumUsageData | undefined): data is PremiumUsageData {
  return Boolean(data && Object.keys(data).length > 0)
}

function hasLookupInputs(allLogins: string[], usernames: string[]): boolean {
  return allLogins.length > 0 && usernames.length > 0
}

async function fetchFirstPremiumUsage(
  allLogins: string[],
  usernames: string[]
): Promise<PremiumUsageData | null> {
  if (!hasLookupInputs(allLogins, usernames)) return null

  for (const username of usernames) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- Accounts are tried in order and stop at the first premium usage response.
    const usageResult = await window.github.getBatchMonthlyRequests(allLogins, username, true)
    if (usageResult.success && hasPremiumUsageData(usageResult.data)) return usageResult.data
  }

  return null
}

function applyUsageDataToSeats(seats: CopilotSeatInfo[], usageData: PremiumUsageData): void {
  for (const seat of seats) {
    const usage = usageData[seat.login]
    if (usage) seat.premiumRequests = usage.requests
  }
}

async function applyPremiumRequestCounts(seats: CopilotSeatInfo[], usernames: string[]) {
  const usageData = await fetchFirstPremiumUsage(
    seats.map(seat => seat.login),
    usernames
  )
  if (!usageData) return
  applyUsageDataToSeats(seats, usageData)
}

function resolveTopSeats(seats: CopilotSeatInfo[]) {
  return seats
    .sort(sortByPremiumRequests)
    .filter(seat => (seat.premiumRequests ?? 0) > 0)
    .slice(0, 50)
}

export function useCopilotSeats(uniqueOrgs: Map<string, string>) {
  const [state, setState] = useState<CopilotSeatsState>(EMPTY_SEATS_STATE)

  const orgsKey = useMemo(() => Array.from(uniqueOrgs.keys()).join(','), [uniqueOrgs])

  const fetchSeats = useCallback(async () => {
    if (uniqueOrgs.size === 0) {
      setState(EMPTY_SEATS_STATE)
      return
    }

    setState(prev => ({ ...prev, loading: true }))

    try {
      const entries = Array.from(uniqueOrgs.entries())
      const settled = await Promise.allSettled(
        entries.map(([org, username]) => fetchOrgSeats(org, username))
      )
      const { seats, orgErrors, truncated } = collectSeatResults(settled)
      const uniqueUsernames = [...new Set(entries.map(([, u]) => u))]
      await applyPremiumRequestCounts(seats, uniqueUsernames)

      setState({
        seats: resolveTopSeats(seats),
        loading: false,
        orgErrors,
        truncated,
      })
    } catch (err: unknown) {
      setState(prev => ({
        ...prev,
        loading: false,
        orgErrors: [{ org: 'all', error: getErrorMessage(err) }],
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgsKey])

  useEffect(() => {
    fetchSeats()
  }, [fetchSeats])

  return { ...state, refresh: fetchSeats }
}
