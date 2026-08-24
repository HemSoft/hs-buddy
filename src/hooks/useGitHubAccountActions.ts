import { useCallback } from 'react'
import type { GitHubAccount, UsageProvider } from '../types/config'
import { getErrorMessage } from '../utils/errorUtils'
import { useGitHubAccountMutations, useGitHubAccountsConvex } from './useConvex'
import {
  mirrorConnectedGitHubAccounts,
  persistUsageProviderOverride,
  publishUsageProviderOverrideChange,
} from './useUsageProviderOverrides'

type ConvexAccounts = ReturnType<typeof useGitHubAccountsConvex>
type ConvexAccount = NonNullable<ConvexAccounts>[number]
type CreateMutation = ReturnType<typeof useGitHubAccountMutations>['create']
type UpdateMutation = ReturnType<typeof useGitHubAccountMutations>['update']
type RemoveMutation = ReturnType<typeof useGitHubAccountMutations>['remove']
type MutationResult = { success: boolean; error?: string }
type UsageProviderUpdateOptions = { localOnly?: boolean }

const LOCAL_ACCOUNT_MIRROR_ATTEMPTS = 3

function findAccount(accounts: ConvexAccounts, username: string, org: string) {
  return accounts?.find(account => account.username === username && account.org === org)
}

async function persistLocalUsageProvider(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  usageProvider: UsageProvider,
  connectedAccounts?: NonNullable<ConvexAccounts>
): Promise<MutationResult> {
  try {
    if (connectedAccounts) {
      const mirror = await mirrorConnectedGitHubAccounts(connectedAccounts)
      if (!mirror.success) {
        return { success: false, error: mirror.error ?? 'Failed to mirror connected accounts' }
      }
    }
    return await persistUsageProviderOverride(account, usageProvider)
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
  }
}

async function reconcileConnectedUsageProvider(
  account: ConvexAccount,
  usageProvider: UsageProvider,
  update: UpdateMutation
): Promise<MutationResult> {
  try {
    if (account.usageProvider === usageProvider) {
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

async function removeConnectedAccount(
  accounts: ConvexAccounts,
  username: string,
  org: string,
  remove: RemoveMutation
): Promise<MutationResult> {
  try {
    const account = findAccount(accounts, username, org)
    if (!account) return { success: false, error: 'Account not found' }
    await remove({ id: account._id })
    const remainingAccounts = accounts?.filter(candidate => candidate._id !== account._id) ?? []
    let error = 'Account removed, but its offline fallback could not be cleared'
    for (let attempt = 0; attempt < LOCAL_ACCOUNT_MIRROR_ATTEMPTS; attempt += 1) {
      try {
        const mirrored = await mirrorConnectedGitHubAccounts(remainingAccounts)
        if (mirrored.success) {
          publishUsageProviderOverrideChange(account, null)
          return { success: true }
        }
        error = mirrored.error ?? error
      } catch (caught: unknown) {
        error = getErrorMessage(caught)
      }
    }
    return { success: false, error }
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) }
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

async function updateConnectedUsageProvider(
  accounts: ConvexAccounts,
  update: UpdateMutation,
  username: string,
  org: string,
  usageProvider: UsageProvider,
  options: UsageProviderUpdateOptions
): Promise<MutationResult> {
  const accountIdentity = { username, org }
  if (options.localOnly) {
    return persistLocalUsageProvider(accountIdentity, usageProvider, accounts)
  }

  try {
    const account = findAccount(accounts, username, org)
    if (!account) return await persistLocalUsageProvider(accountIdentity, usageProvider)

    await update({ id: account._id, usageProvider })
    const result = await persistUsageProviderOverride(accountIdentity, null)
    return result.success
      ? { success: true }
      : { success: false, error: result.error ?? 'Failed to reconcile local provider' }
  } catch (error: unknown) {
    const fallback = await persistLocalUsageProvider(accountIdentity, usageProvider, accounts)
    return fallback.success
      ? fallback
      : { success: false, error: fallback.error ?? getErrorMessage(error) }
  }
}

export function useGitHubAccountActions(convexAccounts: ConvexAccounts) {
  const { create, update, remove } = useGitHubAccountMutations()

  const reconcileUsageProvider = useCallback(
    async (
      username: string,
      org: string,
      usageProvider: UsageProvider
    ): Promise<MutationResult> => {
      const account = findAccount(convexAccounts, username, org)
      if (!account) return { success: false, error: 'Account not found' }
      return reconcileConnectedUsageProvider(account, usageProvider, update)
    },
    [convexAccounts, update]
  )

  const addAccount = (account: GitHubAccount) => createConnectedAccount(account, create)
  const removeAccount = (username: string, org: string) =>
    removeConnectedAccount(convexAccounts, username, org, remove)
  const updateAccount = (username: string, org: string, updates: Partial<GitHubAccount>) =>
    updateConnectedAccount(convexAccounts, username, org, updates, update)

  const updateUsageProvider = async (
    username: string,
    org: string,
    usageProvider: UsageProvider,
    options: UsageProviderUpdateOptions = {}
  ): Promise<MutationResult> =>
    updateConnectedUsageProvider(convexAccounts, update, username, org, usageProvider, options)

  return { addAccount, removeAccount, updateAccount, updateUsageProvider, reconcileUsageProvider }
}
