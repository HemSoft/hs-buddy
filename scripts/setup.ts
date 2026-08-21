import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  describeVersionAlignment,
  readPinnedSdkVersion,
  shouldSpawnThroughShell,
} from './aspireBootstrap'

const ROOT = resolve(import.meta.dirname, '..')
const SPAWN_OPTS = shouldSpawnThroughShell(process.platform) ? { shell: true } : {}
// Overridable so non-standard installs can point at a specific CLI path.
const ASPIRE_COMMAND = process.env.ASPIRE_CLI || 'aspire'

function runStep(executable: string, args: string[], description: string): void {
  const result = spawnSync(executable, args, { stdio: 'inherit', ...SPAWN_OPTS })

  if (result.error) {
    console.error(`ERROR: ${description} could not start: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`ERROR: ${description} failed with exit code ${result.status ?? 'unknown'}.`)
    process.exit(result.status ?? 1)
  }
}

function installedAspireVersion(): string | undefined {
  const probe = spawnSync(ASPIRE_COMMAND, ['--version'], { ...SPAWN_OPTS, encoding: 'utf8' })
  if (probe.error || probe.status !== 0) return undefined
  return probe.stdout.trim() || undefined
}

runStep(process.execPath, ['install', '--frozen-lockfile'], 'frozen dependency install')

const expectedVersion = readPinnedSdkVersion(
  readFileSync(resolve(ROOT, 'aspire.config.json'), 'utf-8')
)
const actualVersion = installedAspireVersion()

switch (describeVersionAlignment(expectedVersion, actualVersion)) {
  case 'mismatch':
    console.warn(
      `WARNING: Aspire CLI version drift: aspire.config.json pins ${expectedVersion} but PATH provides '${actualVersion}'. CI uses the pinned version; consider aligning, e.g. 'dotnet tool update -g Aspire.Cli --version ${expectedVersion}'.`
    )
    break
  default:
    break
}

if (!actualVersion) {
  console.error(
    `ERROR: The Aspire CLI was not found or not runnable on PATH${
      expectedVersion ? `; aspire.config.json pins SDK ${expectedVersion}` : ''
    }. Install it, e.g. 'dotnet tool install -g Aspire.Cli', then re-run 'bun run setup'.`
  )
  process.exit(1)
}

runStep(ASPIRE_COMMAND, ['restore', '--non-interactive'], 'Aspire AppHost restore')
