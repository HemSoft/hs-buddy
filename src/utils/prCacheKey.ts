import type { GitHubAccount } from '../types/config'

type AccountIdentity = Pick<GitHubAccount, 'username' | 'org'>

/** Return a stable, order-independent identity for the configured accounts. */
export function getAccountSetFingerprint(accounts: readonly AccountIdentity[]): string {
  const identities = Array.from(
    new Set(accounts.map(account => JSON.stringify([account.username, account.org])))
  ).sort()
  return encodeURIComponent(JSON.stringify(identities))
}

export function getPRCacheKey(mode: string, accounts: readonly AccountIdentity[]): string {
  return `pr:${mode}:${getAccountSetFingerprint(accounts)}`
}

export function getPRTaskName(
  label: string,
  mode: string,
  accounts: readonly AccountIdentity[]
): string {
  return `${label.toLowerCase()}-${mode}:${getAccountSetFingerprint(accounts)}`
}
