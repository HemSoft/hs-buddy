import { ConvexError } from 'convex/values'
import { env, type QueryCtx, type MutationCtx } from '../_generated/server'

type AuthContext = Pick<QueryCtx | MutationCtx, 'auth'>

function configuredIdentities(): Set<string> {
  const raw = env.CONVEX_AUTHORIZED_IDENTITIES
  const entries =
    raw === undefined
      ? []
      : raw
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
  if (entries.length === 0) {
    throw new ConvexError({
      code: 'MISCONFIGURED',
      message:
        'CONVEX_AUTHORIZED_IDENTITIES is not configured; refusing all access to protected APIs.',
    })
  }
  return new Set(entries)
}

function assertAuthorizedTokenIdentifier(tokenIdentifier: string): void {
  if (configuredIdentities().has(tokenIdentifier)) return

  throw new ConvexError({
    code: 'UNAUTHORIZED',
    message: 'This Convex identity is not authorized to execute hs-buddy work.',
  })
}

export async function requireAuthorizedIdentity(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required to access executable jobs, runs, and schedules.',
    })
  }

  assertAuthorizedTokenIdentifier(identity.tokenIdentifier)
  return identity
}
