import { useEffect, useRef, useState } from 'react'
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

function applyOverride(
  account: GitHubAccount,
  overrides: UsageProviderOverrides,
  convexConnected: boolean
): GitHubAccount {
  const localProvider = overrides[getUsageProviderOverrideKey(account)]
  const usageProvider = convexConnected
    ? (account.usageProvider ?? localProvider)
    : (localProvider ?? account.usageProvider)
  return { ...account, ...(usageProvider ? { usageProvider } : {}) }
}

function resolveAccountsFromSources(
  convexAccounts: ConvexGitHubAccount[] | undefined,
  electronStoreAccounts: GitHubAccount[],
  overrides: UsageProviderOverrides
): GitHubAccount[] {
  if (convexAccounts) {
    return convexAccounts.map(account =>
      applyOverride(
        {
          username: account.username,
          org: account.org,
          ...(account.repoRoot ? { repoRoot: account.repoRoot } : {}),
          ...(account.usageProvider ? { usageProvider: account.usageProvider } : {}),
        },
        overrides,
        true
      )
    )
  }
  return electronStoreAccounts.map(account => applyOverride(account, overrides, false))
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

async function reconcileOverride(account: ConvexGitHubAccount, key: string): Promise<void> {
  try {
    await persistUsageProviderOverride(account, null)
  } catch (_: unknown) {
    // Keep the override so a later account refresh can retry reconciliation.
  } finally {
    reconciliations.delete(key)
  }
}

export function useLocalAccountConfig(convexAccounts: ConvexGitHubAccount[] | undefined) {
  const [accounts, setAccounts] = useState<GitHubAccount[]>([])
  const [overrides, setOverrides] = useState<UsageProviderOverrides>({})
  const [loaded, setLoaded] = useState(true)

  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
      .then((config: AppConfig) => {
        setAccounts(config.github.accounts)
        setOverrides(config.github.usageProviderOverrides ?? {})
      })
      .catch(() => {
        setAccounts([])
        setOverrides({})
      })
      .finally(() => {
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    const handleOverride = (event: Event) => {
      const { key, provider } = (event as CustomEvent<OverrideEvent>).detail
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
  }, [])

  useEffect(() => {
    if (!convexAccounts) return
    for (const account of convexAccounts) {
      if (!account.usageProvider) continue
      const key = getUsageProviderOverrideKey(account)
      if (!overrides[key] || reconciliations.has(key)) continue
      reconciliations.add(key)
      void reconcileOverride(account, key)
    }
  }, [convexAccounts, overrides])

  return { accounts, overrides, loaded }
}
