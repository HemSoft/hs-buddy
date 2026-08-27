import type { GitHubAccount, UsageProvider } from '../types/config'

export type UsageProviderOverrides = Partial<Record<string, UsageProvider>>

export function getUsageProviderOverrideKey(
  account: Pick<GitHubAccount, 'username' | 'org'>
): string {
  return `${account.org.trim().toLowerCase()}/${account.username.trim().toLowerCase()}`
}
