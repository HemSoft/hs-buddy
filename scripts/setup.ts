import { spawnSync } from 'node:child_process'

function runStep(executable: string, args: string[], description: string): void {
  const result = spawnSync(executable, args, { stdio: 'inherit' })

  if (result.error) {
    console.error(`ERROR: ${description} could not start: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`ERROR: ${description} failed with exit code ${result.status ?? 'unknown'}.`)
    process.exit(result.status ?? 1)
  }
}

runStep(process.execPath, ['install', '--frozen-lockfile'], 'frozen dependency install')
runStep('aspire', ['restore', '--non-interactive'], 'Aspire AppHost restore')
