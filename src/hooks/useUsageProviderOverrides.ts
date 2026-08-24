import {
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
import {
  cancelUsageProviderRetry,
  useUsageProviderRetry,
  type CanAttemptReconciliation,
  type ScheduleRetry,
} from './useUsageProviderRetry'
import { useAccountMigrationReady } from './useAccountMigrationState'

export type ConvexGitHubAccount = {
  username: string
  org: string
  repoRoot?: string
  usageProvider?: UsageProvider
}

const OVERRIDE_EVENT = 'buddy:usage-provider-override-changed'
const reconciliations = new Map<string, Promise<void>>()
const manualSelections = new Set<string>()

type OverrideEvent = {
  key: string
  provider: UsageProvider | null
}

type OverrideResult = { success: boolean; error?: string }
type ReconcileUsageProvider = (
  username: string,
  org: string,
  provider: UsageProvider
) => Promise<OverrideResult>
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

async function waitForUsageProviderReconciliation(
  account: Pick<GitHubAccount, 'username' | 'org'>
): Promise<void> {
  const reconciliation = reconciliations.get(getUsageProviderOverrideKey(account))
  if (reconciliation) await reconciliation
}

export async function serializeUsageProviderSelection<T>(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  operation: () => Promise<T>
): Promise<T> {
  const key = getUsageProviderOverrideKey(account)
  await waitForUsageProviderReconciliation(account)
  cancelUsageProviderRetry(key)
  manualSelections.add(key)
  try {
    return await operation()
  } finally {
    manualSelections.delete(key)
  }
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
  const durableAccounts = new Map<string, GitHubAccount>()
  for (const account of accounts) {
    const durableAccount = {
      username: account.username,
      org: account.org,
      ...(account.repoRoot ? { repoRoot: account.repoRoot } : {}),
      ...(account.usageProvider ? { usageProvider: account.usageProvider } : {}),
    }
    durableAccounts.set(getUsageProviderOverrideKey(durableAccount), durableAccount)
  }
  return [...durableAccounts.values()]
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

function trackReconciliation(key: string, operation: Promise<void>) {
  reconciliations.set(key, operation)
  void operation.finally(() => {
    if (reconciliations.get(key) === operation) reconciliations.delete(key)
  })
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
  setAccounts: Dispatch<SetStateAction<GitHubAccount[]>>,
  setOverrides: Dispatch<SetStateAction<UsageProviderOverrides>>,
  changedOverrideKeys: RefObject<Set<string>>,
  accountsMirroredFromConvex: RefObject<boolean>
) {
  useEffect(() => {
    if (!convexAccounts || !localConfigLoaded || !accountMigrationReady) return
    if (convexAccounts.length === 0 && hasLocalAccounts && !accountsMirroredFromConvex.current) {
      return
    }
    const mirroredAccounts = toDurableAccounts(convexAccounts)
    void settleOverrideResult(() => mirrorConnectedGitHubAccounts(convexAccounts)).then(
      (result: OverrideResult) => {
        if (!result.success) return
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
  }, [
    accountsMirroredFromConvex,
    changedOverrideKeys,
    convexAccounts,
    hasLocalAccounts,
    localConfigLoaded,
    accountMigrationReady,
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
  return Boolean(
    provider && !reconciliations.has(key) && !manualSelections.has(key) && canAttempt(key)
  )
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
  canAttempt: CanAttemptReconciliation
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
      if (!canStartReconciliation(key, provider, canAttempt)) continue
      if (isBlockedCodexTransfer(key, connectedOverrides[key], explicitCodexOwnerKey)) continue
      const operation =
        connectedOverrides[key] === provider
          ? reconcileOverride(account, key, provider, reconcile, scheduleRetry)
          : discardOverride(account, key, scheduleRetry)
      trackReconciliation(key, operation)
    }
  }, [canAttempt, convexAccounts, overrides, reconcile, retryRevision, scheduleRetry])
}

export function useLocalAccountConfig(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  reconcile: ReconcileUsageProvider,
  connectionCount: number
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

  useInitialLocalConfig(setAccounts, setOverrides, setLoaded, changedOverrideKeys)
  useConnectedAccountMirror(
    convexAccounts,
    accounts.length > 0,
    loaded,
    accountMigrationReady,
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
    canAttempt
  )

  return { accounts, overrides, loaded }
}
