import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { IPC_INVOKE } from '../ipc/contracts'
import type { AppConfig, GitHubAccount, UsageProvider } from '../types/config'
import {
  getUsageProviderOverrideKey,
  type UsageProviderOverrides,
} from '../utils/usageProviderOverrides'

export type ConvexGitHubAccount = {
  username: string
  org: string
  repoRoot?: string
  usageProvider?: UsageProvider
}

const OVERRIDE_EVENT = 'buddy:usage-provider-override-changed'
const OVERRIDE_RETRY_EVENT = 'buddy:usage-provider-override-retry'
const reconciliations = new Set<string>()

type OverrideEvent = {
  key: string
  provider: UsageProvider | null
}

type OverrideRetryEvent = { key: string }

type OverrideResult = { success: boolean; error?: string }
type ReconcileUsageProvider = (
  username: string,
  org: string,
  provider: UsageProvider
) => Promise<OverrideResult>
type ScheduleRetry = (key: string) => void

const RECONCILIATION_RETRY_MS = 1_000
const MAX_RECONCILIATION_RETRIES = 5

function notifyOverride(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  provider: UsageProvider | null
) {
  window.dispatchEvent(
    new CustomEvent<OverrideEvent>(OVERRIDE_EVENT, {
      detail: { key: getUsageProviderOverrideKey(account), provider },
    })
  )
}

export function publishUsageProviderOverrideChange(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  provider: UsageProvider | null
) {
  notifyOverride(account, provider)
}

function notifyOverrideRetry(key: string) {
  window.dispatchEvent(
    new CustomEvent<OverrideRetryEvent>(OVERRIDE_RETRY_EVENT, { detail: { key } })
  )
}

export async function persistUsageProviderOverride(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  provider: UsageProvider | null
): Promise<OverrideResult> {
  const result = (await window.ipcRenderer.invoke(
    IPC_INVOKE.CONFIG_SET_USAGE_PROVIDER_OVERRIDE,
    account.username,
    account.org,
    provider
  )) as OverrideResult
  if (result.success) notifyOverride(account, provider)
  return result
}

function toDurableAccounts(accounts: ConvexGitHubAccount[]): GitHubAccount[] {
  return accounts.map(account => ({
    username: account.username,
    org: account.org,
    ...(account.repoRoot ? { repoRoot: account.repoRoot } : {}),
    ...(account.usageProvider ? { usageProvider: account.usageProvider } : {}),
  }))
}

export async function mirrorConnectedGitHubAccounts(
  accounts: ConvexGitHubAccount[]
): Promise<OverrideResult> {
  return (await window.ipcRenderer.invoke(
    IPC_INVOKE.CONFIG_SYNC_GITHUB_ACCOUNTS,
    toDurableAccounts(accounts)
  )) as OverrideResult
}

function applyOverride(account: GitHubAccount, overrides: UsageProviderOverrides): GitHubAccount {
  const localProvider = overrides[getUsageProviderOverrideKey(account)]
  const usageProvider = localProvider ?? account.usageProvider
  return { ...account, ...(usageProvider ? { usageProvider } : {}) }
}

function getConnectedOverrides(
  accounts: ConvexGitHubAccount[],
  overrides: UsageProviderOverrides
): UsageProviderOverrides {
  const explicitCodexOwner = accounts.find(account => {
    const override = overrides[getUsageProviderOverrideKey(account)]
    return account.usageProvider === 'codex' && override !== 'copilot'
  })
  let codexOwnerKey = explicitCodexOwner ? getUsageProviderOverrideKey(explicitCodexOwner) : null
  const connectedOverrides: UsageProviderOverrides = {}

  for (const account of accounts) {
    const key = getUsageProviderOverrideKey(account)
    const provider = overrides[key]
    if (!provider) continue
    if (provider === 'codex' && codexOwnerKey && codexOwnerKey !== key) continue
    connectedOverrides[key] = provider
    if (provider === 'codex') codexOwnerKey = key
  }
  return connectedOverrides
}

function resolveAccountsFromSources(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  electronStoreAccounts: GitHubAccount[],
  overrides: UsageProviderOverrides
): GitHubAccount[] {
  if (convexAccounts) {
    const connectedOverrides = getConnectedOverrides(convexAccounts, overrides)
    return convexAccounts.map(account =>
      applyOverride(
        {
          username: account.username,
          org: account.org,
          ...(account.repoRoot ? { repoRoot: account.repoRoot } : {}),
          ...(account.usageProvider ? { usageProvider: account.usageProvider } : {}),
        },
        connectedOverrides
      )
    )
  }
  return electronStoreAccounts.map(account => applyOverride(account, overrides))
}

export function useResolvedAccounts(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  electronStoreAccounts: GitHubAccount[],
  overrides: UsageProviderOverrides
): GitHubAccount[] {
  const resolved = resolveAccountsFromSources(convexAccounts, electronStoreAccounts, overrides)
  const contentKey = JSON.stringify(
    resolved.map(account => [
      account.username,
      account.org,
      account.repoRoot,
      account.usageProvider,
    ])
  )
  const previousKey = useRef('')
  const accounts = useRef<GitHubAccount[]>([])
  if (previousKey.current !== contentKey) {
    previousKey.current = contentKey
    accounts.current = resolved
  }
  return accounts.current
}

async function settleOverrideResult(operation: () => Promise<OverrideResult>) {
  try {
    return await operation()
  } catch (_: unknown) {
    return { success: false }
  }
}

async function reconcileOverride(
  account: ConvexGitHubAccount,
  key: string,
  provider: UsageProvider,
  reconcile: ReconcileUsageProvider,
  scheduleRetry: ScheduleRetry
): Promise<void> {
  const result = await settleOverrideResult(() =>
    reconcile(account.username, account.org, provider)
  )
  reconciliations.delete(key)
  if (!result.success) scheduleRetry(key)
}

async function discardOverride(
  account: ConvexGitHubAccount,
  key: string,
  scheduleRetry: ScheduleRetry
): Promise<void> {
  const result = await settleOverrideResult(() => persistUsageProviderOverride(account, null))
  reconciliations.delete(key)
  if (!result.success) scheduleRetry(key)
}

export function mergeUsageProviderOverrideSnapshot(
  snapshot: UsageProviderOverrides,
  current: UsageProviderOverrides,
  changedKeys: Set<string>
): UsageProviderOverrides {
  const merged = { ...snapshot }
  for (const key of changedKeys) {
    const provider = current[key]
    if (provider) merged[key] = provider
    else delete merged[key]
  }
  return merged
}

function useInitialLocalConfig(
  setAccounts: Dispatch<SetStateAction<GitHubAccount[]>>,
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  setLoaded: Dispatch<SetStateAction<boolean>>,
  changedOverrideKeys: RefObject<Set<string>>,
  accountsMirroredFromConvex: RefObject<boolean>
) {
  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
      .then((config: AppConfig) => {
        if (!accountsMirroredFromConvex.current) setAccounts(config.github.accounts)
        setOverrides(current =>
          mergeUsageProviderOverrideSnapshot(
            config.github.usageProviderOverrides ?? {},
            current,
            changedOverrideKeys.current
          )
        )
      })
      .catch(() => {
        setAccounts([])
      })
      .finally(() => {
        setLoaded(true)
      })
  }, [accountsMirroredFromConvex, changedOverrideKeys, setAccounts, setLoaded, setOverrides])
}

function useConnectedAccountMirror(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  setAccounts: Dispatch<SetStateAction<GitHubAccount[]>>,
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  changedOverrideKeys: RefObject<Set<string>>,
  accountsMirroredFromConvex: RefObject<boolean>
) {
  useEffect(() => {
    if (!convexAccounts) return
    const mirroredAccounts = toDurableAccounts(convexAccounts)
    void mirrorConnectedGitHubAccounts(convexAccounts)
      .then((result: OverrideResult) => {
        if (!result.success) return
        accountsMirroredFromConvex.current = true
        setAccounts(mirroredAccounts)
        const mirroredAccountKeys = new Set(mirroredAccounts.map(getUsageProviderOverrideKey))
        setOverrides(current => {
          const next: UsageProviderOverrides = {}
          let changed = false
          for (const [key, provider] of Object.entries(current)) {
            if (mirroredAccountKeys.has(key)) next[key] = provider
            else {
              changed = true
              changedOverrideKeys.current.add(key)
            }
          }
          return changed ? next : current
        })
      })
      .catch(() => {
        // Keep the last durable snapshot when electron-store cannot be updated.
      })
  }, [accountsMirroredFromConvex, changedOverrideKeys, convexAccounts, setAccounts, setOverrides])
}

function useOverrideEvents(
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  changedOverrideKeys: RefObject<Set<string>>
) {
  useEffect(() => {
    const handleOverride = (event: Event) => {
      const { key, provider } = (event as CustomEvent<OverrideEvent>).detail
      changedOverrideKeys.current.add(key)
      setOverrides(current => {
        const next = { ...current }
        if (provider === null) delete next[key]
        else next[key] = provider
        return next
      })
    }
    window.addEventListener(OVERRIDE_EVENT, handleOverride)
    return () => {
      window.removeEventListener(OVERRIDE_EVENT, handleOverride)
    }
  }, [changedOverrideKeys, setOverrides])
}

function useOverrideReconciliation(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  overrides: UsageProviderOverrides,
  reconcile: ReconcileUsageProvider,
  retryRevision: number,
  scheduleRetry: ScheduleRetry
) {
  useEffect(() => {
    if (!convexAccounts) return
    const connectedOverrides = getConnectedOverrides(convexAccounts, overrides)
    const explicitCodexOwner = convexAccounts.find(account => account.usageProvider === 'codex')
    const explicitCodexOwnerKey = explicitCodexOwner
      ? getUsageProviderOverrideKey(explicitCodexOwner)
      : null
    for (const account of convexAccounts) {
      const key = getUsageProviderOverrideKey(account)
      const provider = overrides[key]
      if (!provider || reconciliations.has(key)) continue
      if (
        connectedOverrides[key] === 'codex' &&
        explicitCodexOwnerKey &&
        explicitCodexOwnerKey !== key
      ) {
        continue
      }
      reconciliations.add(key)
      if (connectedOverrides[key] === provider) {
        void reconcileOverride(account, key, provider, reconcile, scheduleRetry)
      } else {
        void discardOverride(account, key, scheduleRetry)
      }
    }
  }, [convexAccounts, overrides, reconcile, retryRevision, scheduleRetry])
}

function useReconciliationRetry(retryContext: string): [number, ScheduleRetry] {
  const [revision, setRevision] = useState(0)
  const timers = useRef(new Map<string, number>())
  const attempts = useRef(new Map<string, number>())
  const scheduleRetry = useCallback((key: string) => notifyOverrideRetry(key), [])

  useEffect(() => {
    const activeTimers = timers.current
    const handleRetry = (event: Event) => {
      const { key } = (event as CustomEvent<OverrideRetryEvent>).detail
      if (activeTimers.has(key)) return
      const attempt = attempts.current.get(key) ?? 0
      if (attempt >= MAX_RECONCILIATION_RETRIES) return
      attempts.current.set(key, attempt + 1)
      const timer = window.setTimeout(
        () => {
          activeTimers.delete(key)
          setRevision(current => current + 1)
        },
        RECONCILIATION_RETRY_MS * 2 ** attempt
      )
      activeTimers.set(key, timer)
    }
    window.addEventListener(OVERRIDE_RETRY_EVENT, handleRetry)
    return () => {
      window.removeEventListener(OVERRIDE_RETRY_EVENT, handleRetry)
      for (const timer of activeTimers.values()) window.clearTimeout(timer)
      activeTimers.clear()
    }
  }, [])

  useEffect(() => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    timers.current.clear()
    attempts.current.clear()
  }, [retryContext])

  return [revision, scheduleRetry]
}

export function useLocalAccountConfig(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  reconcile: ReconcileUsageProvider
) {
  const [accounts, setAccounts] = useState<GitHubAccount[]>([])
  const [overrides, setOverrides] = useState<UsageProviderOverrides>({})
  const [loaded, setLoaded] = useState(true)
  const changedOverrideKeys = useRef(new Set<string>())
  const accountsMirroredFromConvex = useRef(false)
  const retryContext = JSON.stringify([
    convexAccounts?.map(account => [account.username, account.org, account.usageProvider]),
    overrides,
  ])
  const [retryRevision, scheduleRetry] = useReconciliationRetry(retryContext)

  useInitialLocalConfig(
    setAccounts,
    setOverrides,
    setLoaded,
    changedOverrideKeys,
    accountsMirroredFromConvex
  )
  useConnectedAccountMirror(
    convexAccounts,
    setAccounts,
    setOverrides,
    changedOverrideKeys,
    accountsMirroredFromConvex
  )
  useOverrideEvents(setOverrides, changedOverrideKeys)
  useOverrideReconciliation(convexAccounts, overrides, reconcile, retryRevision, scheduleRetry)

  return { accounts, overrides, loaded }
}
