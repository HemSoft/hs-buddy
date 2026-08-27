import {
  useCallback,
  useEffect,
  useMemo,
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
  canStartUsageProviderReconciliation,
  isBlockedCodexTransfer,
  serializeUsageProviderMaintenance,
  startPendingUsageProviderRecovery,
  trackUsageProviderReconciliation,
} from './usageProviderSelectionCoordinator'
import {
  useUsageProviderRetry,
  type CanAttemptReconciliation,
  type ScheduleRetry,
} from './useUsageProviderRetry'
import {
  clearPendingRemoteOverrides,
  observeRemoteAccounts,
  type ObservedAccountGroup,
  type PendingRemoteClears,
} from './githubAccountMirrorObservation'
import {
  getConnectedOverrides,
  markOverrideChange,
  mergeConnectedOverrides,
  mergeUsageProviderOverrideSnapshot,
  resolveAccountsFromSources,
  retainDefaultOverrides,
  toDurableAccounts,
  type ConvexGitHubAccount,
} from './githubAccountProviderState'

export type { ConvexGitHubAccount } from './githubAccountProviderState'

export {
  invalidateUsageProviderSelection,
  serializeUsageProviderSelection,
} from './usageProviderSelectionCoordinator'

const OVERRIDE_EVENT = 'buddy:usage-provider-override-changed'
const ACCOUNT_MIRROR_RETRY_BASE_DELAY_MS = 1_000
const MAX_ACCOUNT_MIRROR_RETRIES = 5

type OverrideEvent = {
  key: string
  provider: UsageProvider | null
}

type OverrideResult = { success: boolean; error?: string }
type AccountMirrorResult = OverrideResult & {
  usageProviderOverrides?: UsageProviderOverrides
  usageProviderDefaultOverrides?: UsageProviderOverrides
}
type AccountMirrorSetters = {
  accounts: Dispatch<SetStateAction<GitHubAccount[]>>
  overrides: Dispatch<SetStateAction<UsageProviderOverrides>>
  defaults: Dispatch<SetStateAction<UsageProviderOverrides>>
}
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

export function mirrorConnectedGitHubAccounts(
  accounts: ConvexGitHubAccount[]
): Promise<AccountMirrorResult> {
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

export function useResolvedAccounts(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  electronStoreAccounts: GitHubAccount[],
  overrides: UsageProviderOverrides,
  defaultOverrides: UsageProviderOverrides
): GitHubAccount[] {
  const resolved = resolveAccountsFromSources(
    convexAccounts,
    electronStoreAccounts,
    overrides,
    defaultOverrides
  )
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

export { mergeUsageProviderOverrideSnapshot } from './githubAccountProviderState'

function useInitialLocalConfig(
  setAccounts: Dispatch<SetStateAction<GitHubAccount[]>>,
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  setDefaultOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  setLoaded: Dispatch<SetStateAction<boolean>>,
  changedOverrideKeys: RefObject<Set<string>>,
  changedDefaultOverrideKeys: RefObject<Set<string>>
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
        setDefaultOverrides(current =>
          mergeUsageProviderOverrideSnapshot(
            config.github.usageProviderDefaultOverrides ?? {},
            current,
            changedDefaultOverrideKeys.current
          )
        )
      })
      .catch(() => {
        setAccounts([])
      })
      .finally(() => {
        setLoaded(true)
      })
  }, [
    changedDefaultOverrideKeys,
    changedOverrideKeys,
    setAccounts,
    setDefaultOverrides,
    setLoaded,
    setOverrides,
  ])
}

function clearRemoteOverrides(pendingClears: PendingRemoteClears) {
  return clearPendingRemoteOverrides(
    pendingClears,
    account => settleOverrideResult(() => persistUsageProviderOverride(account, null)),
    serializeUsageProviderMaintenance
  )
}

function applyConnectedMirrorResult(
  result: AccountMirrorResult,
  mirroredAccounts: GitHubAccount[],
  setters: AccountMirrorSetters,
  changedOverrideKeys: RefObject<Set<string>>,
  changedDefaultOverrideKeys: RefObject<Set<string>>
) {
  setters.accounts(mirroredAccounts)
  const accountKeys = new Set(mirroredAccounts.map(getUsageProviderOverrideKey))
  setters.overrides(current =>
    mergeConnectedOverrides(
      result.usageProviderOverrides,
      result.usageProviderDefaultOverrides,
      current,
      accountKeys,
      changedOverrideKeys.current,
      changedDefaultOverrideKeys.current
    )
  )
  setters.defaults(current =>
    retainDefaultOverrides(
      result.usageProviderDefaultOverrides,
      current,
      accountKeys,
      changedDefaultOverrideKeys.current
    )
  )
}

function getMirrorSnapshot(
  connectionCount: number,
  mirroredAccounts: GitHubAccount[],
  documentSnapshot: ReadonlyArray<unknown>
) {
  return JSON.stringify([connectionCount, mirroredAccounts, documentSnapshot])
}

function resetMirrorRetry(
  snapshot: string,
  retrySnapshot: RefObject<string | null>,
  retryAttempt: RefObject<number>
) {
  if (retrySnapshot.current === snapshot) return
  retrySnapshot.current = snapshot
  retryAttempt.current = 0
}

function useConnectedAccountMirror(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  hasLocalAccounts: boolean,
  localConfigLoaded: boolean,
  accountMigrationReady: boolean,
  connectionCount: number,
  setters: AccountMirrorSetters,
  changedOverrideKeys: RefObject<Set<string>>,
  changedDefaultOverrideKeys: RefObject<Set<string>>,
  accountsMirroredFromConvex: RefObject<boolean>
) {
  const [retryRevision, setRetryRevision] = useState(0)
  const retryAttempt = useRef(0)
  const retrySnapshot = useRef<string | null>(null)
  const lastMirroredSnapshot = useRef<string | null>(null)
  const observedAccountGroups = useRef(new Map<string, ObservedAccountGroup>())
  const pendingRemoteClears = useRef<PendingRemoteClears>(new Map())

  useEffect(() => {
    if (!convexAccounts || !localConfigLoaded || !accountMigrationReady) return
    if (convexAccounts.length === 0 && hasLocalAccounts && !accountsMirroredFromConvex.current) {
      return
    }
    const mirroredAccounts = toDurableAccounts(convexAccounts)
    const observation = observeRemoteAccounts(
      convexAccounts,
      observedAccountGroups.current,
      pendingRemoteClears.current
    )
    observedAccountGroups.current = observation.groups
    const snapshot = getMirrorSnapshot(
      connectionCount,
      mirroredAccounts,
      observation.documentSnapshot
    )
    if (lastMirroredSnapshot.current === snapshot) return
    resetMirrorRetry(snapshot, retrySnapshot, retryAttempt)
    if (retryAttempt.current > MAX_ACCOUNT_MIRROR_RETRIES) return
    let cancelled = false
    let retryTimer: number | undefined
    void clearRemoteOverrides(pendingRemoteClears.current)
      .then(clearResult =>
        clearResult.success
          ? settleOverrideResult(() => mirrorConnectedGitHubAccounts(convexAccounts))
          : clearResult
      )
      .then((result: AccountMirrorResult) => {
        if (cancelled) return
        if (!result.success) {
          retryTimer = scheduleAccountMirrorRetry(retryAttempt, setRetryRevision)
          return
        }
        retryAttempt.current = 0
        lastMirroredSnapshot.current = snapshot
        accountsMirroredFromConvex.current = true
        applyConnectedMirrorResult(
          result,
          mirroredAccounts,
          setters,
          changedOverrideKeys,
          changedDefaultOverrideKeys
        )
      })
    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [
    accountsMirroredFromConvex,
    changedOverrideKeys,
    changedDefaultOverrideKeys,
    connectionCount,
    convexAccounts,
    hasLocalAccounts,
    localConfigLoaded,
    accountMigrationReady,
    retryRevision,
    setters,
  ])
}

function useOverrideEvents(
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  setDefaultOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  changedKeys: RefObject<Set<string>>,
  changedDefaultKeys: RefObject<Set<string>>
) {
  useEffect(() => {
    const handleOverride = (event: Event) => {
      const { key, provider } = (event as CustomEvent<OverrideEvent>).detail
      markOverrideChange(key, provider, changedKeys.current, changedDefaultKeys.current)
      setOverrides(current => {
        const next = { ...current }
        if (provider === null) delete next[key]
        else next[key] = provider
        return next
      })
      setDefaultOverrides(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
    window.addEventListener(OVERRIDE_EVENT, handleOverride)
    return () => {
      window.removeEventListener(OVERRIDE_EVENT, handleOverride)
    }
  }, [changedDefaultKeys, changedKeys, setDefaultOverrides, setOverrides])
}

function useOverrideReconciliation(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  overrides: UsageProviderOverrides,
  defaultOverrides: UsageProviderOverrides,
  reconcile: ReconcileUsageProvider,
  retryRevision: number,
  scheduleRetry: ScheduleRetry,
  canAttempt: CanAttemptReconciliation,
  canAttemptWhileConnected: CanAttemptReconciliation
) {
  useEffect(() => {
    if (!convexAccounts) return
    const connectedOverrides = getConnectedOverrides(convexAccounts, overrides, defaultOverrides)
    const explicitCodexOwner = convexAccounts.find(account => account.usageProvider === 'codex')
    const explicitCodexOwnerKey = explicitCodexOwner
      ? getUsageProviderOverrideKey(explicitCodexOwner)
      : null
    for (const account of convexAccounts) {
      const key = getUsageProviderOverrideKey(account)
      if (startPendingUsageProviderRecovery(key, canAttempt)) continue
      const provider = overrides[key]
      if (!canStartUsageProviderReconciliation(key, provider, canAttemptWhileConnected)) continue
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
    defaultOverrides,
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
  const [defaultOverrides, setDefaultOverrides] = useState<UsageProviderOverrides>({})
  const [loaded, setLoaded] = useState(false)
  const mirrorSetters = useMemo(
    () => ({ accounts: setAccounts, overrides: setOverrides, defaults: setDefaultOverrides }),
    []
  )
  const accountMigrationReady = useAccountMigrationReady()
  const changedOverrideKeys = useRef(new Set<string>())
  const changedDefaultOverrideKeys = useRef(new Set<string>())
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
            defaultOverrides[key],
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

  useInitialLocalConfig(
    setAccounts,
    setOverrides,
    setDefaultOverrides,
    setLoaded,
    changedOverrideKeys,
    changedDefaultOverrideKeys
  )
  useConnectedAccountMirror(
    convexAccounts,
    accounts.length > 0,
    loaded,
    accountMigrationReady,
    connectionCount,
    mirrorSetters,
    changedOverrideKeys,
    changedDefaultOverrideKeys,
    accountsMirroredFromConvex
  )
  useOverrideEvents(
    setOverrides,
    setDefaultOverrides,
    changedOverrideKeys,
    changedDefaultOverrideKeys
  )
  useOverrideReconciliation(
    convexAccounts,
    overrides,
    defaultOverrides,
    reconcile,
    retryRevision,
    scheduleRetry,
    canAttempt,
    canAttemptWhileConnected
  )

  return { accounts, overrides, defaultOverrides, loaded }
}
