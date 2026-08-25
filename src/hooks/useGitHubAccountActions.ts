import { useCallback, useRef } from 'react'
import type { GitHubAccount, UsageProvider } from '../types/config'
import { getErrorMessage } from '../utils/errorUtils'
import { getUsageProviderOverrideKey } from '../utils/usageProviderOverrides'
import { useGitHubAccountMutations, useGitHubAccountsConvex } from './useConvex'
import {
  mirrorConnectedGitHubAccounts,
  persistUsageProviderOverride,
  invalidateUsageProviderSelection,
  serializeUsageProviderSelection,
} from './useUsageProviderOverrides'

type ConvexAccounts = ReturnType<typeof useGitHubAccountsConvex>
type ConvexAccount = NonNullable<ConvexAccounts>[number]
type CreateMutation = ReturnType<typeof useGitHubAccountMutations>['create']
type UpdateMutation = ReturnType<typeof useGitHubAccountMutations>['update']
type RemoveMutation = ReturnType<typeof useGitHubAccountMutations>['remove']
type MutationResult = { success: boolean; error?: string }
type UsageProviderUpdateOptions = { localOnly?: boolean }
type IsSuperseded = () => boolean
type GetConvexAccounts = () => ConvexAccounts
type RemovalTombstone = { id: ConvexAccount['_id']; cleanupSettled: boolean }

const LOCAL_ACCOUNT_MIRROR_ATTEMPTS = 3

function findAccount(accounts: ConvexAccounts, username: string, org: string) {
  return accounts?.find(account => account.username === username && account.org === org)
}

async function persistLocalUsageProvider(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  usageProvider: UsageProvider,
  connectedAccounts?: NonNullable<ConvexAccounts>,
  isSuperseded: IsSuperseded = () => false
): Promise<MutationResult> {
  try {
    if (connectedAccounts) {
      const mirror = await mirrorConnectedGitHubAccounts(connectedAccounts)
      if (!mirror.success) {
        if (isSuperseded()) return { success: true }
        return { success: false, error: mirror.error ?? 'Failed to mirror connected accounts' }
      }
    }
    if (isSuperseded()) return { success: true }
    return await persistUsageProviderOverride(account, usageProvider)
  } catch (error: unknown) {
    if (isSuperseded()) return { success: true }
    return { success: false, error: getErrorMessage(error) }
  }
}

async function reconcileConnectedUsageProvider(
  account: ConvexAccount,
  usageProvider: UsageProvider,
  update: UpdateMutation,
  connectedAccounts: NonNullable<ConvexAccounts>
): Promise<MutationResult> {
  try {
    if (account.usageProvider === usageProvider) {
      const mirror = await mirrorConnectedGitHubAccounts(connectedAccounts)
      if (!mirror.success) {
        return { success: false, error: mirror.error ?? 'Failed to mirror connected provider' }
      }
      const result = await persistUsageProviderOverride(account, null)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Failed to reconcile local provider' }
    }
    await update({ id: account._id, usageProvider })
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function createConnectedAccount(
  account: GitHubAccount,
  create: CreateMutation
): Promise<MutationResult> {
  try {
    await create({
      username: account.username,
      org: account.org,
      ...(account.usageProvider ? { usageProvider: account.usageProvider } : {}),
    })
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function clearRemovedAccountFallback(
  account: ConvexAccount,
  getAccounts: () => ConvexAccounts
): Promise<MutationResult> {
  const cleared = await persistUsageProviderOverride(account, null)
  if (!cleared.success) return cleared
  const remainingAccounts = getAccounts()?.filter(candidate => candidate._id !== account._id) ?? []
  return mirrorConnectedGitHubAccounts(remainingAccounts)
}

async function clearRemovedAccountFallbackWithRetry(
  account: ConvexAccount,
  getAccounts: () => ConvexAccounts
): Promise<MutationResult> {
  let error = 'Account removed, but its offline fallback could not be cleared'
  for (let attempt = 0; attempt < LOCAL_ACCOUNT_MIRROR_ATTEMPTS; attempt += 1) {
    try {
      const result = await clearRemovedAccountFallback(account, getAccounts)
      if (result.success) return result
      error = result.error ?? error
    } catch (caught: unknown) {
      error = getErrorMessage(caught)
    }
  }
  return { success: false, error }
}

function settleRemovalTombstone(
  removedAccounts: Map<string, RemovalTombstone>,
  key: string,
  tombstone: RemovalTombstone,
  removalCompleted: boolean,
  oldAccountStillPresent: boolean | undefined
) {
  if (removedAccounts.get(key) !== tombstone) return
  tombstone.cleanupSettled = true
  if (!removalCompleted || oldAccountStillPresent === false) removedAccounts.delete(key)
}

async function removeConnectedAccount(
  getAccounts: () => ConvexAccounts,
  username: string,
  org: string,
  remove: RemoveMutation,
  removedAccounts: Map<string, RemovalTombstone>
): Promise<MutationResult> {
  const account = findAccount(getAccounts(), username, org)
  if (!account) return { success: false, error: 'Account not found' }
  const key = getUsageProviderOverrideKey(account)
  const tombstone = { id: account._id, cleanupSettled: false }
  removedAccounts.set(key, tombstone)
  let removalCompleted = false
  try {
    await remove({ id: account._id })
    removalCompleted = true
    await invalidateUsageProviderSelection(account)
    return await clearRemovedAccountFallbackWithRetry(account, getAccounts)
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  } finally {
    const oldAccountStillPresent = getAccounts()?.some(candidate => candidate._id === account._id)
    settleRemovalTombstone(
      removedAccounts,
      key,
      tombstone,
      removalCompleted,
      oldAccountStillPresent
    )
  }
}

async function updateConnectedAccount(
  accounts: ConvexAccounts,
  username: string,
  org: string,
  updates: Partial<GitHubAccount>,
  update: UpdateMutation
): Promise<MutationResult> {
  try {
    const account = findAccount(accounts, username, org)
    if (!account) return { success: false, error: 'Account not found' }
    await update({ id: account._id, ...updates })
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function persistSerializedLocalUsageProvider(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  usageProvider: UsageProvider,
  accounts: ConvexAccounts,
  isSuperseded: IsSuperseded
) {
  if (isSuperseded()) return { success: true }
  const result = await persistLocalUsageProvider(account, usageProvider, accounts, isSuperseded)
  return isSuperseded() ? { success: true } : result
}

async function persistRejectedConnectedUsageProvider(
  accountIdentity: Pick<GitHubAccount, 'username' | 'org'>,
  accountId: ConvexAccount['_id'],
  usageProvider: UsageProvider,
  accounts: ConvexAccounts,
  getAccounts: GetConvexAccounts,
  error: unknown,
  isSuperseded: IsSuperseded
): Promise<MutationResult> {
  const latestAccounts = getAccounts()
  const latestAccount = findAccount(latestAccounts, accountIdentity.username, accountIdentity.org)
  if (latestAccounts && latestAccount?._id !== accountId) {
    if (latestAccount) return { success: false, error: 'Account was replaced' }
    const cleared = await persistUsageProviderOverride(accountIdentity, null)
    return cleared.success
      ? { success: false, error: 'Account no longer exists' }
      : { success: false, error: cleared.error ?? getErrorMessage(error) }
  }
  const fallback = await persistLocalUsageProvider(
    accountIdentity,
    usageProvider,
    latestAccounts ?? accounts,
    isSuperseded
  )
  return fallback.success
    ? fallback
    : { success: false, error: fallback.error ?? getErrorMessage(error) }
}

async function persistSerializedConnectedUsageProvider(
  accountIdentity: Pick<GitHubAccount, 'username' | 'org'>,
  usageProvider: UsageProvider,
  accounts: ConvexAccounts,
  getAccounts: GetConvexAccounts,
  update: UpdateMutation,
  isSuperseded: IsSuperseded
): Promise<MutationResult> {
  const account = findAccount(accounts, accountIdentity.username, accountIdentity.org)
  if (!account) return await persistLocalUsageProvider(accountIdentity, usageProvider)
  try {
    if (isSuperseded()) return { success: true }
    await update({ id: account._id, usageProvider })
    if (isSuperseded()) return { success: true }
    const result = await persistLocalUsageProvider(
      accountIdentity,
      usageProvider,
      getAccounts() ?? accounts,
      isSuperseded
    )
    return result.success
      ? { success: true }
      : { success: false, error: result.error ?? 'Failed to preserve local provider' }
  } catch (error: unknown) {
    if (isSuperseded()) return { success: true }
    return persistRejectedConnectedUsageProvider(
      accountIdentity,
      account._id,
      usageProvider,
      accounts,
      getAccounts,
      error,
      isSuperseded
    )
  }
}

async function updateConnectedUsageProvider(
  accounts: ConvexAccounts,
  getAccounts: GetConvexAccounts,
  update: UpdateMutation,
  username: string,
  org: string,
  usageProvider: UsageProvider,
  options: UsageProviderUpdateOptions
): Promise<MutationResult> {
  const accountIdentity = { username, org }
  return serializeUsageProviderSelection(
    accountIdentity,
    async isSuperseded =>
      options.localOnly
        ? persistSerializedLocalUsageProvider(
            accountIdentity,
            usageProvider,
            accounts,
            isSuperseded
          )
        : persistSerializedConnectedUsageProvider(
            accountIdentity,
            usageProvider,
            accounts,
            getAccounts,
            update,
            isSuperseded
          ),
    {
      waitForReconciliation: !options.localOnly,
      ...(options.localOnly
        ? {
            recoverAfterStaleReconciliation: () =>
              persistUsageProviderOverride(accountIdentity, usageProvider),
          }
        : {}),
    }
  )
}

export function useGitHubAccountActions(
  convexAccounts: ConvexAccounts,
  isWebSocketConnected: boolean
) {
  const { create, update, remove } = useGitHubAccountMutations()
  const accountsRef = useRef(convexAccounts)
  accountsRef.current = convexAccounts
  const removedAccountsRef = useRef(new Map<string, RemovalTombstone>())
  if (convexAccounts) {
    const currentIds = new Set(convexAccounts.map(account => account._id))
    for (const [key, tombstone] of removedAccountsRef.current) {
      if (tombstone.cleanupSettled && !currentIds.has(tombstone.id)) {
        removedAccountsRef.current.delete(key)
      }
    }
  }

  const reconcileUsageProvider = useCallback(
    async (
      username: string,
      org: string,
      usageProvider: UsageProvider
    ): Promise<MutationResult> => {
      if (!convexAccounts) return { success: false, error: 'Account not found' }
      const account = findAccount(convexAccounts, username, org)
      if (!account) return { success: false, error: 'Account not found' }
      return reconcileConnectedUsageProvider(account, usageProvider, update, convexAccounts)
    },
    [convexAccounts, update]
  )

  const addAccount = (account: GitHubAccount) => createConnectedAccount(account, create)
  const removeAccount = (username: string, org: string) =>
    removeConnectedAccount(
      () => accountsRef.current,
      username,
      org,
      remove,
      removedAccountsRef.current
    )
  const updateAccount = (username: string, org: string, updates: Partial<GitHubAccount>) =>
    updateConnectedAccount(convexAccounts, username, org, updates, update)

  const updateUsageProvider = async (
    username: string,
    org: string,
    usageProvider: UsageProvider,
    options: UsageProviderUpdateOptions = {}
  ): Promise<MutationResult> => {
    if (removedAccountsRef.current.has(getUsageProviderOverrideKey({ username, org }))) {
      return { success: false, error: 'Account removal in progress' }
    }
    return updateConnectedUsageProvider(
      convexAccounts,
      () => accountsRef.current,
      update,
      username,
      org,
      usageProvider,
      {
        ...options,
        localOnly: options.localOnly === true || !isWebSocketConnected,
      }
    )
  }

  return { addAccount, removeAccount, updateAccount, updateUsageProvider, reconcileUsageProvider }
}
