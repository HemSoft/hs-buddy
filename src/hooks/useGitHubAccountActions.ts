import type { GitHubAccount, UsageProvider } from '../types/config'
import { getErrorMessage } from '../utils/errorUtils'
import { useGitHubAccountMutations, useGitHubAccountsConvex } from './useConvex'
import { persistUsageProviderOverride } from './useUsageProviderOverrides'

type ConvexAccounts = ReturnType<typeof useGitHubAccountsConvex>
type MutationResult = { success: boolean; error?: string }

function findAccount(accounts: ConvexAccounts, username: string, org: string) {
  return accounts?.find(account => account.username === username && account.org === org)
}

export function useGitHubAccountActions(convexAccounts: ConvexAccounts) {
  const { create, update, remove } = useGitHubAccountMutations()

  const addAccount = async (account: GitHubAccount): Promise<MutationResult> => {
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

  const removeAccount = async (username: string, org: string): Promise<MutationResult> => {
    try {
      const account = findAccount(convexAccounts, username, org)
      if (!account) return { success: false, error: 'Account not found' }
      await remove({ id: account._id })
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  const updateAccount = async (
    username: string,
    org: string,
    updates: Partial<GitHubAccount>
  ): Promise<MutationResult> => {
    try {
      const account = findAccount(convexAccounts, username, org)
      if (!account) return { success: false, error: 'Account not found' }
      await update({ id: account._id, ...updates })
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  const updateUsageProvider = async (
    username: string,
    org: string,
    usageProvider: UsageProvider
  ): Promise<MutationResult> => {
    try {
      const account = findAccount(convexAccounts, username, org)
      if (!account) return persistUsageProviderOverride({ username, org }, usageProvider)

      await update({ id: account._id, usageProvider })
      const result = await persistUsageProviderOverride({ username, org }, null)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Failed to reconcile local provider' }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  }

  return { addAccount, removeAccount, updateAccount, updateUsageProvider }
}
