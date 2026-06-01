import { useState, useCallback, useRef } from 'react'
import type { useGitHubAccounts } from '../../../hooks/useConfig'
import { useToggleSet } from '../../../hooks/useToggleSet'
import {
  type OrgMember,
  type OrgTeam,
  type OrgTeamResult,
  type TeamMember,
  type TeamMembersResult,
  type OrgMemberResult,
  type OrgOverviewResult,
} from '../../../api/github'
import { GitHubClient } from '../../../api/github/client'
import { dataCache } from '../../../services/dataCache'
import { isAbortError, throwIfAborted } from '../../../utils/errorUtils'

type EnqueueFn = (
  fn: (signal?: AbortSignal) => Promise<unknown>,
  meta: { name: string; priority?: number }
) => Promise<unknown>

type LoadingSetSetter = React.Dispatch<React.SetStateAction<Set<string>>>

function addToLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => new Set(prev).add(key))
}

function removeFromLoadingSet(setter: LoadingSetSetter, key: string) {
  setter(prev => {
    const next = new Set(prev)
    next.delete(key)
    return next
  })
}

async function executeFetchWithLoading<TRaw>(opts: {
  key: string
  cacheKey: string
  loadingSetter: LoadingSetSetter
  enqueue: EnqueueFn
  taskName: string
  logLabel: string
  apiFn: () => Promise<TRaw>
  onData: (data: TRaw) => void
}): Promise<void> {
  try {
    const result = (await opts.enqueue(
      async signal => {
        /* v8 ignore start */
        if (signal) throwIfAborted(signal)
        /* v8 ignore stop */
        return await opts.apiFn()
      },
      { name: opts.taskName, priority: -1 }
    )) as TRaw
    opts.onData(result)
    dataCache.set(opts.cacheKey, result)
  } catch (error: unknown) {
    if (isAbortError(error)) return
    console.warn(`[${opts.logLabel}] ${opts.key} failed:`, error)
  } finally {
    removeFromLoadingSet(opts.loadingSetter, opts.key)
  }
}

async function fetchCachedOrgData<TRaw>(opts: {
  key: string
  cacheKey: string
  loadingSetter: LoadingSetSetter
  enqueue: EnqueueFn
  taskName: string
  logLabel: string
  apiFn: () => Promise<TRaw>
  onData: (data: TRaw) => void
  forceRefresh?: boolean
}): Promise<void> {
  const cached = dataCache.get<TRaw>(opts.cacheKey)
  if (cached?.data && !opts.forceRefresh) {
    opts.onData(cached.data)
    return
  }
  addToLoadingSet(opts.loadingSetter, opts.key)
  await executeFetchWithLoading(opts)
}

function toContributorMap(overview: OrgOverviewResult): Record<string, number> {
  return Object.fromEntries(overview.metrics.topContributorsToday.map(c => [c.login, c.commits]))
}

function getCachedOrgOverview(org: string, forceRefresh: boolean): OrgOverviewResult | null {
  /* v8 ignore next -- forceRefresh=true branch only used by future callers */
  if (forceRefresh) return null
  const cached = dataCache.get<OrgOverviewResult>(`org-overview:${org}`)
  return cached?.data ?? null
}

interface UseSidebarOrgActionsOptions {
  accounts: ReturnType<typeof useGitHubAccounts>['accounts']
  enqueueRef: React.MutableRefObject<EnqueueFn>
}

export function useSidebarOrgActions(opts: UseSidebarOrgActionsOptions) {
  const { accounts, enqueueRef } = opts

  const orgUserGroups = useToggleSet()
  const orgTeamGroups = useToggleSet()
  const teams = useToggleSet()

  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({})
  const [loadingOrgMembers, setLoadingOrgMembers] = useState<Set<string>>(new Set())
  const [orgTeams, setOrgTeams] = useState<Record<string, OrgTeam[]>>({})
  const [loadingOrgTeams, setLoadingOrgTeams] = useState<Set<string>>(new Set())
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({})
  const [loadingTeamMembers, setLoadingTeamMembers] = useState<Set<string>>(new Set())
  const [orgContributorCounts, setOrgContributorCounts] = useState<
    Record<string, Record<string, number>>
  >({})

  const fetchedOrgMembersRef = useRef<Set<string>>(new Set())
  const fetchedOrgOverviewRef = useRef<Set<string>>(new Set())
  const fetchedOrgTeamsRef = useRef<Set<string>>(new Set())
  const fetchedTeamMembersRef = useRef<Set<string>>(new Set())

  const fetchOrgMembers = useCallback(
    async (org: string, forceRefresh = false) => {
      await fetchCachedOrgData<OrgMemberResult>({
        key: org,
        cacheKey: `org-members:${org}`,
        loadingSetter: setLoadingOrgMembers,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `org-members-${org}`,
        logLabel: 'OrgMembers',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchOrgMembers(org),
        onData: result => setOrgMembers(prev => ({ ...prev, [org]: result.members })),
        forceRefresh,
      })
    },
    [accounts, enqueueRef]
  )

  const fetchOrgOverview = useCallback(
    async (org: string, forceRefresh = false) => {
      const cacheKey = `org-overview:${org}`
      const cached = getCachedOrgOverview(org, forceRefresh)

      if (cached) {
        setOrgContributorCounts(prev => ({ ...prev, [org]: toContributorMap(cached) }))
        return
      }

      try {
        const result = (await enqueueRef.current(
          /* v8 ignore start -- callback executed by queue system */
          async signal => {
            if (signal) throwIfAborted(signal)
            const client = new GitHubClient({ accounts }, 7)
            return await client.fetchOrgOverview(org)
          },
          /* v8 ignore stop */
          { name: `org-overview-${org}`, priority: -1 }
        )) as OrgOverviewResult
        setOrgContributorCounts(prev => ({ ...prev, [org]: toContributorMap(result) }))
        dataCache.set(cacheKey, result)
      } catch (error: unknown) {
        /* v8 ignore start */
        if (isAbortError(error)) return
        /* v8 ignore stop */
        console.warn(`[OrgOverview] ${org} failed:`, error)
      }
    },
    [accounts, enqueueRef]
  )

  const toggleOrgUserGroup = useCallback(
    (org: string) => {
      const shouldFetchMembers = !fetchedOrgMembersRef.current.has(org)
      const shouldFetchOverview = !fetchedOrgOverviewRef.current.has(org)

      orgUserGroups.toggle(org)

      if (shouldFetchMembers) {
        fetchedOrgMembersRef.current.add(org)
        fetchOrgMembers(org)
      }
      if (shouldFetchOverview) {
        fetchedOrgOverviewRef.current.add(org)
        fetchOrgOverview(org)
      }
    },
    [orgUserGroups, fetchOrgMembers, fetchOrgOverview]
  )

  const fetchOrgTeams = useCallback(
    async (org: string, forceRefresh = false) => {
      await fetchCachedOrgData<OrgTeamResult>({
        key: org,
        cacheKey: `org-teams:${org}`,
        loadingSetter: setLoadingOrgTeams,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `org-teams-${org}`,
        logLabel: 'OrgTeams',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchOrgTeams(org),
        onData: result => setOrgTeams(prev => ({ ...prev, [org]: result.teams })),
        forceRefresh,
      })
    },
    [accounts, enqueueRef]
  )

  const toggleOrgTeamGroup = useCallback(
    (org: string) => {
      const shouldFetch = !fetchedOrgTeamsRef.current.has(org)

      orgTeamGroups.toggle(org)

      if (shouldFetch) {
        fetchedOrgTeamsRef.current.add(org)
        fetchOrgTeams(org)
      }
    },
    [orgTeamGroups, fetchOrgTeams]
  )

  const fetchTeamMembers = useCallback(
    async (org: string, teamSlug: string) => {
      const key = `${org}/${teamSlug}`
      await fetchCachedOrgData<TeamMembersResult>({
        key,
        cacheKey: `team-members:${key}`,
        loadingSetter: setLoadingTeamMembers,
        enqueue: enqueueRef.current as EnqueueFn,
        taskName: `team-members-${key}`,
        logLabel: 'TeamMembers',
        apiFn: () => new GitHubClient({ accounts }, 7).fetchTeamMembers(org, teamSlug),
        onData: result => setTeamMembers(prev => ({ ...prev, [key]: result.members })),
      })
    },
    [accounts, enqueueRef]
  )

  const toggleTeam = useCallback(
    (org: string, teamSlug: string) => {
      const key = `${org}/${teamSlug}`
      const shouldFetch = !fetchedTeamMembersRef.current.has(key)

      teams.toggle(key)

      if (shouldFetch) {
        fetchedTeamMembersRef.current.add(key)
        fetchTeamMembers(org, teamSlug)
      }
    },
    [teams, fetchTeamMembers]
  )

  return {
    orgMembers,
    loadingOrgMembers,
    expandedOrgUserGroups: orgUserGroups.set,
    orgTeams,
    loadingOrgTeams,
    expandedOrgTeamGroups: orgTeamGroups.set,
    expandedTeams: teams.set,
    teamMembers,
    loadingTeamMembers,
    orgContributorCounts,
    toggleOrgUserGroup,
    toggleOrgTeamGroup,
    toggleTeam,
  }
}
