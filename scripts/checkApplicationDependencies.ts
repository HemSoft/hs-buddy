import { spawnSync } from 'node:child_process'

export interface CommandResult {
  status: number | null
  error?: Error
  stdout?: string
  stderr?: string
}

export type CommandRunner = (executable: string, args: string[]) => CommandResult

export interface DependencyCheckOptions {
  repair?: boolean
  bunExecutable?: string
  runCommand?: CommandRunner
  writeError?: (message: string) => void
  writeInfo?: (message: string) => void
}

const PROBE_ARGS = ['x', '--no-install', 'convex', '--version']
const REPAIR_ARGS = ['install', '--force', '--frozen-lockfile']
type WriteMessage = (message: string) => void

function defaultRunner(executable: string, args: string[]): CommandResult {
  return spawnSync(executable, args, { encoding: 'utf8' })
}

function succeeded(result: CommandResult): boolean {
  return result.error === undefined && result.status === 0
}

function failureDetail(result: CommandResult): string | undefined {
  if (result.error) return result.error.message

  const output = [result.stderr, result.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
    .trim()

  return output || undefined
}

function writeFailureDetail(result: CommandResult, writeError: WriteMessage): void {
  const detail = failureDetail(result)
  if (detail) writeError(detail)
}

function reportFastModeFailure(result: CommandResult, writeError: WriteMessage): false {
  writeError('ERROR: The repository-local Convex CLI is missing or unusable.')
  writeFailureDetail(result, writeError)
  writeError('Repair with: bun install --force --frozen-lockfile')
  writeError('Or run: ./scripts/runAspire.debug.ps1 -FullBuild')
  return false
}

function repairDependencies(
  bunExecutable: string,
  runCommand: CommandRunner,
  writeError: WriteMessage,
  writeInfo: WriteMessage
): boolean {
  writeInfo('Application dependencies are unusable. Repairing for full build...')
  const result = runCommand(bunExecutable, REPAIR_ARGS)
  if (succeeded(result)) return true

  writeError('ERROR: bun install --force --frozen-lockfile failed.')
  writeFailureDetail(result, writeError)
  return false
}

function validateRepair(
  bunExecutable: string,
  runCommand: CommandRunner,
  writeError: WriteMessage
): boolean {
  const result = runCommand(bunExecutable, PROBE_ARGS)
  if (succeeded(result)) return true

  writeError('ERROR: The repository-local Convex CLI is still unusable after repair.')
  writeFailureDetail(result, writeError)
  return false
}

export function checkApplicationDependencies({
  repair = false,
  bunExecutable = process.execPath,
  runCommand = defaultRunner,
  writeError = console.error,
  writeInfo = console.info,
}: DependencyCheckOptions = {}): boolean {
  const initialProbe = runCommand(bunExecutable, PROBE_ARGS)
  if (succeeded(initialProbe)) return true

  if (!repair) return reportFastModeFailure(initialProbe, writeError)
  if (!repairDependencies(bunExecutable, runCommand, writeError, writeInfo)) return false
  return validateRepair(bunExecutable, runCommand, writeError)
}

if (import.meta.main) {
  const repair = process.argv.slice(2).includes('--repair')
  if (!checkApplicationDependencies({ repair })) process.exitCode = 1
}
