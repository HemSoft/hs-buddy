import {
  useCallback,
  useEffect,
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
import { useAccountMigrationReady } from './useAccountMigrationState'
import {
  hasPendingUsageProviderWork,
  startPendingUsageProviderRecovery,
  trackUsageProviderReconciliation,
} from './usageProviderSelectionCoordinator'
import {
  useUsageProviderRetry,
  type CanAttemptReconciliation,
  type ScheduleRetry,
} from './useUsageProviderRetry'

export {
  invalidateUsageProviderSelection,
  serializeUsageProviderSelection,
} from './usageProviderSelectionCoordinator'

export type ConvexGitHubAccount = {
  _id?: string
  username: string
  org: string
  repoRoot?: string
  usageProvider?: UsageProvider
  createdAt?: number
  updatedAt?: number
}

const OVERRIDE_EVENT = 'buddy:usage-provider-override-changed'
const ACCOUNT_MIRROR_RETRY_BASE_DELAY_MS = 1_000
const MAX_ACCOUNT_MIRROR_RETRIES = 5

type OverrideEvent = {
  key: string
  provider: UsageProvider | null
}

type OverrideResult = { success: boolean; error?: string }
let connectedAccountMirrorQueue: Promise<void> = Promise.resolve()
type ReconcileUsageProvider = (
  username: string,
  org: string,
  provider: UsageProvider
) => Promise<OverrideResult>

function scheduleAccountMirrorRetry(
  retryAttempt: RefObject<number>,
  setRetryRevision: Dispatch<SetStateAction<number>>
): number | undefined {
  if (retryAttempt.current >= MAX_ACCOUNT_MIRROR_RETRIES) {
    retryAttempt.current = MAX_ACCOUNT_MIRROR_RETRIES + 1
    console.error(`[GitHub accounts] Giving up after ${MAX_ACCOUNT_MIRROR_RETRIES} mirror retries`)
    return undefined
  }
  const retryDelay = ACCOUNT_MIRROR_RETRY_BASE_DELAY_MS * 2 ** retryAttempt.current
  retryAttempt.current += 1
  return window.setTimeout(() => {
    setRetryRevision(current => current + 1)
  }, retryDelay)
}

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
  const accountGroups = new Map<string, ConvexGitHubAccount[]>()
  for (const account of accounts) {
    const key = getUsageProviderOverrideKey(account)
    accountGroups.set(key, [...(accountGroups.get(key) ?? []), account])
  }
  return [...accountGroups.values()].map(group => {
    const ordered = [...group].sort((left, right) => {
      const updatedDifference =
        (left.updatedAt ?? left.createdAt ?? 0) - (right.updatedAt ?? right.createdAt ?? 0)
      return updatedDifference || (left._id ?? '').localeCompare(right._id ?? '')
    })
    const canonical = ordered[0]
    return ordered.reduce<GitHubAccount>(
      (durable, account) => ({
        ...durable,
        ...(account.repoRoot === undefined ? {} : { repoRoot: account.repoRoot }),
        ...(account.usageProvider === undefined ? {} : { usageProvider: account.usageProvider }),
      }),
      { username: canonical.username, org: canonical.org }
    )
  })
}

export function mirrorConnectedGitHubAccounts(
  accounts: ConvexGitHubAccount[]
): Promise<OverrideResult> {
  const snapshot = toDurableAccounts(accounts)
  const operation = connectedAccountMirrorQueue.then(
    () =>
      window.ipcRenderer.invoke(
        IPC_INVOKE.CONFIG_SYNC_GITHUB_ACCOUNTS,
        snapshot
      ) as Promise<OverrideResult>
  )
  connectedAccountMirrorQueue = operation.then(
    () => {},
    () => {}
  )
  return operation
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
  if (!result.success) scheduleRetry(key)
}

async function discardOverride(
  account: ConvexGitHubAccount,
  key: string,
  scheduleRetry: ScheduleRetry
): Promise<void> {
  const result = await settleOverrideResult(() => persistUsageProviderOverride(account, null))
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
  changedOverrideKeys: RefObject<Set<string>>
) {
  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
      .then((config: AppConfig) => {
        setAccounts(config.github.accounts)
        const snapshot = config.github.usageProviderOverrides ?? {}
        setOverrides(current =>
          mergeUsageProviderOverrideSnapshot(snapshot, current, changedOverrideKeys.current)
        )
      })
      .catch(() => {
        setAccounts([])
      })
      .finally(() => {
        setLoaded(true)
      })
  }, [changedOverrideKeys, setAccounts, setLoaded, setOverrides])
}

function useConnectedAccountMirror(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  hasLocalAccounts: boolean,
  localConfigLoaded: boolean,
  accountMigrationReady: boolean,
  connectionCount: number,
  setAccounts: Dispatch<SetStateAction<GitHubAccount[]>>,
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  changedOverrideKeys: RefObject<Set<string>>,
  accountsMirroredFromConvex: RefObject<boolean>
) {
  const [retryRevision, setRetryRevision] = useState(0)
  const retryAttempt = useRef(0)
  const retrySnapshot = useRef<string | null>(null)
  const lastMirroredSnapshot = useRef<string | null>(null)

  useEffect(() => {
    if (!convexAccounts || !localConfigLoaded || !accountMigrationReady) return
    if (convexAccounts.length === 0 && hasLocalAccounts && !accountsMirroredFromConvex.current) {
      return
    }
    const mirroredAccounts = toDurableAccounts(convexAccounts)
    const snapshot = JSON.stringify([connectionCount, mirroredAccounts])
    if (lastMirroredSnapshot.current === snapshot) return
    if (retrySnapshot.current !== snapshot) {
      retrySnapshot.current = snapshot
      retryAttempt.current = 0
    }
    if (retryAttempt.current > MAX_ACCOUNT_MIRROR_RETRIES) return
    let cancelled = false
    let retryTimer: number | undefined
    void settleOverrideResult(() => mirrorConnectedGitHubAccounts(convexAccounts)).then(
      (result: OverrideResult) => {
        if (cancelled) return
        if (!result.success) {
          retryTimer = scheduleAccountMirrorRetry(retryAttempt, setRetryRevision)
          return
        }
        retryAttempt.current = 0
        lastMirroredSnapshot.current = snapshot
        accountsMirroredFromConvex.current = true
        setAccounts(mirroredAccounts)
        const accountKeys = new Set(mirroredAccounts.map(getUsageProviderOverrideKey))
        setOverrides(current => {
          const next: UsageProviderOverrides = {}
          let changed = false
          for (const [key, provider] of Object.entries(current)) {
            if (accountKeys.has(key)) next[key] = provider
            else {
              changed = true
              changedOverrideKeys.current.add(key)
            }
          }
          return changed ? next : current
        })
      }
    )
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [
    accountsMirroredFromConvex,
    changedOverrideKeys,
    connectionCount,
    convexAccounts,
    hasLocalAccounts,
    localConfigLoaded,
    accountMigrationReady,
    retryRevision,
    setAccounts,
    setOverrides,
  ])
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

function canStartReconciliation(
  key: string,
  provider: UsageProvider | undefined,
  canAttempt: CanAttemptReconciliation
): provider is UsageProvider {
  return Boolean(provider && !hasPendingUsageProviderWork(key) && canAttempt(key))
}

function isBlockedCodexTransfer(
  key: string,
  connectedProvider: UsageProvider | undefined,
  explicitCodexOwnerKey: string | null
) {
  return (
    connectedProvider === 'codex' && explicitCodexOwnerKey !== null && explicitCodexOwnerKey !== key
  )
}

function useOverrideReconciliation(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  overrides: UsageProviderOverrides,
  reconcile: ReconcileUsageProvider,
  retryRevision: number,
  scheduleRetry: ScheduleRetry,
  canAttempt: CanAttemptReconciliation,
  canAttemptWhileConnected: CanAttemptReconciliation
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
      if (startPendingUsageProviderRecovery(key, canAttempt)) continue
      const provider = overrides[key]
      if (!canStartReconciliation(key, provider, canAttemptWhileConnected)) continue
      if (isBlockedCodexTransfer(key, connectedOverrides[key], explicitCodexOwnerKey)) continue
      const operation =
        connectedOverrides[key] === provider
          ? reconcileOverride(account, key, provider, reconcile, scheduleRetry)
          : discardOverride(account, key, scheduleRetry)
      trackUsageProviderReconciliation(key, operation)
    }
  }, [
    canAttempt,
    canAttemptWhileConnected,
    convexAccounts,
    overrides,
    reconcile,
    retryRevision,
    scheduleRetry,
  ])
}

export function useLocalAccountConfig(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  reconcile: ReconcileUsageProvider,
  connectionCount: number,
  isWebSocketConnected: boolean
) {
  const [accounts, setAccounts] = useState<GitHubAccount[]>([])
  const [overrides, setOverrides] = useState<UsageProviderOverrides>({})
  const [loaded, setLoaded] = useState(false)
  const accountMigrationReady = useAccountMigrationReady()
  const changedOverrideKeys = useRef(new Set<string>())
  const accountsMirroredFromConvex = useRef(false)
  const retryContext = JSON.stringify(
    (convexAccounts ?? [])
      .map(account => {
        const key = getUsageProviderOverrideKey(account)
        return [
          key,
          JSON.stringify([
            account.repoRoot,
            account.usageProvider,
            overrides[key],
            connectionCount,
          ]),
        ]
      })
      .sort(([left], [right]) => left.localeCompare(right))
  )
  const [retryRevision, scheduleRetry, canAttempt] = useUsageProviderRetry(retryContext)
  const canAttemptWhileConnected = useCallback(
    (key: string) => isWebSocketConnected && canAttempt(key),
    [canAttempt, isWebSocketConnected]
  )

  useInitialLocalConfig(setAccounts, setOverrides, setLoaded, changedOverrideKeys)
  useConnectedAccountMirror(
    convexAccounts,
    accounts.length > 0,
    loaded,
    accountMigrationReady,
    connectionCount,
    setAccounts,
    setOverrides,
    changedOverrideKeys,
    accountsMirroredFromConvex
  )
  useOverrideEvents(setOverrides, changedOverrideKeys)
  useOverrideReconciliation(
    convexAccounts,
    overrides,
    reconcile,
    retryRevision,
    scheduleRetry,
    canAttempt,
    canAttemptWhileConnected
  )

  return { accounts, overrides, loaded }
}
