import { mapRepoPRToPullRequest } from '../../../utils/prMapper'

export { mapRepoPRToPullRequest }

export function getUniqueOrgs(accounts: Array<{ org?: string }>): string[] {
  return (Array.from(new Set(accounts.map(a => a.org))).filter(Boolean) as string[]).sort()
}
