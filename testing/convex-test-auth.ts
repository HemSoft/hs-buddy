import type { convexTest } from 'convex-test'
import { vi } from 'vitest'

const AUTHORIZED_CONVEX_IDENTITIES_ENV = 'CONVEX_AUTHORIZED_IDENTITIES'

const AUTHORIZED_IDENTITY = {
  subject: 'hemsoft-test-user',
  issuer: 'https://auth.test.hs-buddy',
} as const

const AUTHORIZED_TOKEN_IDENTIFIER = `${AUTHORIZED_IDENTITY.issuer}|${AUTHORIZED_IDENTITY.subject}`

export function withAuthorizedIdentity(test: ReturnType<typeof convexTest>) {
  vi.stubEnv(AUTHORIZED_CONVEX_IDENTITIES_ENV, AUTHORIZED_TOKEN_IDENTIFIER)
  return test.withIdentity(AUTHORIZED_IDENTITY)
}

export function restoreAuthorizedIdentityEnv() {
  vi.unstubAllEnvs()
}
