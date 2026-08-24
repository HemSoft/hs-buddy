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

export type ConvexGitHubAccount = {
  username: string
  org: string
  repoRoot?: string
  usageProvider?: UsageProvider
}

const OVERRIDE_EVENT = 'buddy:usage-provider-override-changed'
const reconciliations = new Set<string>()

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

async function reconcileOverride(
  account: ConvexGitHubAccount,
  key: string,
  provider: UsageProvider,
  reconcile: ReconcileUsageProvider
): Promise<void> {
  try {
    await reconcile(account.username, account.org, provider)
  } catch (_: unknown) {
    // Keep the override so a later account refresh can retry reconciliation.
  } finally {
    reconciliations.delete(key)
  }
}

async function discardOverride(account: ConvexGitHubAccount, key: string): Promise<void> {
  try {
    await persistUsageProviderOverride(account, null)
  } catch (_: unknown) {
    // Keep the conflicting override so a later account refresh can retry cleanup.
  } finally {
    reconciliations.delete(key)
  }
}

function mergeInitialOverrides(
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
          mergeInitialOverrides(
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
      })
      .catch(() => {
        // Keep the last durable snapshot when electron-store cannot be updated.
      })
  }, [accountsMirroredFromConvex, convexAccounts, setAccounts])
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
  reconcile: ReconcileUsageProvider
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
        void reconcileOverride(account, key, provider, reconcile)
      } else {
        void discardOverride(account, key)
      }
    }
  }, [convexAccounts, overrides, reconcile])
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

  useInitialLocalConfig(
    setAccounts,
    setOverrides,
    setLoaded,
    changedOverrideKeys,
    accountsMirroredFromConvex
  )
  useConnectedAccountMirror(convexAccounts, setAccounts, accountsMirroredFromConvex)
  useOverrideEvents(setOverrides, changedOverrideKeys)
  useOverrideReconciliation(convexAccounts, overrides, reconcile)

  return { accounts, overrides, loaded }
}
