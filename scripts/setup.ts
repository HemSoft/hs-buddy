import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  describeVersionAlignment,
  readPinnedSdkVersion,
  shouldSpawnThroughShell,
} from './aspireBootstrap'

const ROOT = resolve(import.meta.dirname, '..')
// Windows exposes dotnet-tool CLIs as .cmd shims that only spawn through a
// shell; this option is for the aspire invocations only, never for
// process.execPath.
const ASPIRE_SPAWN_OPTS = shouldSpawnThroughShell(process.platform) ? { shell: true } : {}
// Overridable so non-standard installs can point at a specific CLI path.
const ASPIRE_COMMAND = process.env.ASPIRE_CLI || 'aspire'

type SpawnOptions = { shell?: boolean }

function runStep(
  executable: string,
  args: string[],
  description: string,
  opts: SpawnOptions = {}
): void {
  const result = spawnSync(executable, args, { stdio: 'inherit', ...opts })

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
  const probe = spawnSync(ASPIRE_COMMAND, ['--version'], {
    ...ASPIRE_SPAWN_OPTS,
    encoding: 'utf8',
  })
  if (probe.error || probe.status !== 0) return undefined
  return probe.stdout.trim() || undefined
}

runStep(process.execPath, ['install', '--frozen-lockfile'], 'frozen dependency install')

let expectedVersion: string | undefined
try {
  expectedVersion = readPinnedSdkVersion(readFileSync(resolve(ROOT, 'aspire.config.json'), 'utf-8'))
} catch (_: unknown) {
  console.warn('WARNING: could not read aspire.config.json; skipping SDK version verification.')
}

const actualVersion = installedAspireVersion()

if (
  expectedVersion !== undefined &&
  actualVersion !== undefined &&
  describeVersionAlignment(expectedVersion, actualVersion) === 'mismatch'
) {
  console.warn(
    `WARNING: Aspire CLI version drift: aspire.config.json pins ${expectedVersion} but '${ASPIRE_COMMAND}' reports ${actualVersion}. CI uses the pinned version; consider aligning, e.g. 'dotnet tool update -g Aspire.Cli --version ${expectedVersion}'.`
  )
}

if (actualVersion === undefined) {
  const source = process.env.ASPIRE_CLI ? `'${ASPIRE_COMMAND}' (ASPIRE_CLI)` : "'aspire' on PATH"
  console.error(
    `ERROR: The Aspire CLI ${source} was not found or not runnable${
      expectedVersion ? `; aspire.config.json pins SDK ${expectedVersion}` : ''
    }. Install it, e.g. 'dotnet tool install -g Aspire.Cli', then re-run 'bun run setup'.`
  )
  process.exit(1)
}

runStep(
  ASPIRE_COMMAND,
  ['restore', '--non-interactive'],
  'Aspire AppHost restore',
  ASPIRE_SPAWN_OPTS
)
