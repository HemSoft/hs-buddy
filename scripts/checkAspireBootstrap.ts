import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type FileExists = (path: string) => boolean

const DEFAULT_REPO_ROOT = resolve(import.meta.dirname, '..')
const REQUIRED_APPHOST_FILES = [
  {
    description: 'generated Aspire TypeScript SDK',
    relativePath: 'aspire-apphost/.aspire/modules/aspire.mts',
  },
  {
    description: 'Aspire AppHost dependencies',
    relativePath: 'aspire-apphost/node_modules/vscode-jsonrpc/package.json',
  },
] as const

export function getAspireBootstrapError(
  repoRoot = DEFAULT_REPO_ROOT,
  fileExists: FileExists = existsSync
): string | undefined {
  const missing = REQUIRED_APPHOST_FILES.filter(
    requirement => !fileExists(resolve(repoRoot, requirement.relativePath))
  )
  if (missing.length === 0) return undefined

  const missingDetails = missing
    .map(requirement => `  - ${requirement.description}: ${requirement.relativePath}`)
    .join('\n')

  return [
    'ERROR: Aspire AppHost is not bootstrapped.',
    'Missing:',
    missingDetails,
    '',
    'Bootstrap this checkout once with:',
    '  bun run setup',
    '',
    'That command installs frozen root dependencies and runs Aspire restore.',
    'Warm typechecks only perform this fast preflight.',
  ].join('\n')
}

if (import.meta.main) {
  const error = getAspireBootstrapError()
  if (error) {
    console.error(error)
    process.exitCode = 1
  }
}
