import { isValidGitHubAccountSlug } from '../../shared/githubAccountIdentity'
import {
  getUsageProviderOverrideKey,
  type UsageProviderOverrides,
} from '../utils/usageProviderOverrides'
import type { ConvexGitHubAccount } from './useUsageProviderOverrides'

export type ObservedAccountGroup = {
  account: Pick<ConvexGitHubAccount, 'username' | 'org'>
  ids: Set<string>
}

export type PendingRemoteClears = Map<string, Pick<ConvexGitHubAccount, 'username' | 'org'>>

function hasValidIdentity(account: ConvexGitHubAccount) {
  return isValidGitHubAccountSlug(account.username) && isValidGitHubAccountSlug(account.org)
}

export function observeRemoteAccounts(
  accounts: ConvexGitHubAccount[],
  previous: Map<string, ObservedAccountGroup>,
  pendingClears: PendingRemoteClears
) {
  const groups = new Map<string, ObservedAccountGroup>()
  for (const account of accounts) {
    if (!hasValidIdentity(account)) continue
    const key = getUsageProviderOverrideKey(account)
    const group = groups.get(key) ?? {
      account: { username: account.username, org: account.org },
      ids: new Set<string>(),
    }
    group.ids.add(account._id ?? key)
    groups.set(key, group)
  }
  for (const [key, previousGroup] of previous) {
    const currentGroup = groups.get(key)
    const retainsDocument =
      currentGroup && [...previousGroup.ids].some(id => currentGroup.ids.has(id))
    if (!retainsDocument) pendingClears.set(key, currentGroup?.account ?? previousGroup.account)
  }
  const documentSnapshot = [...groups]
    .map(([key, group]) => [key, [...group.ids].sort()] as const)
    .sort(([left], [right]) => left.localeCompare(right))
  return { groups, documentSnapshot }
}

export function retainConnectedOverrides(
  current: UsageProviderOverrides,
  accountKeys: Set<string>,
  changedKeys: Set<string>
) {
  const next: UsageProviderOverrides = {}
  let changed = false
  for (const [key, provider] of Object.entries(current)) {
    if (accountKeys.has(key)) next[key] = provider
    else {
      changed = true
      changedKeys.add(key)
    }
  }
  return changed ? next : current
}
