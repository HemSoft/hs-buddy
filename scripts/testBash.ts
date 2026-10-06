import { spawnSync } from 'node:child_process'
import { join, win32 } from 'node:path'
import { performance } from 'node:perf_hooks'
import { lstatSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'

const expectedOutput = 'hs-buddy-bash-compatible\n'
const probeSource = `set -eu
counter="$(mktemp "$HS_BUDDY_TEST_BASH_TEMP/counter.XXXXXX")"
trap 'rm -f "$counter"' EXIT
printf '%s' 'buddy "quoted" $literal' > "$counter"
actual="$(cat "$counter")"
[ "$actual" = 'buddy "quoted" $literal' ]
rm -f "$counter"
[ ! -e "$counter" ]
trap - EXIT
printf '%s\\n' 'hs-buddy-bash-compatible'`

type ProbeResult = { status: number | null; stdout: string | null; error?: unknown }
type Options = {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  probe?: (executable: string, timeoutMs: number) => ProbeResult
  now?: () => number
}

function removeProbeDirectory(directory: string): void {
  const root = lstatSync(directory)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Unexpected Bash probe root')
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    if (!name.startsWith('counter.') || !lstatSync(file).isFile())
      throw new Error('Unexpected Bash probe counter')
    unlinkSync(file)
  }
  rmdirSync(directory)
}

function nativeProbe(executable: string, timeoutMs: number): ProbeResult {
  const directory = mkdtempSync(join(tmpdir(), 'hs-buddy-bash-probe-'))
  let result: ProbeResult
  try {
    result = spawnSync(executable, ['-c', probeSource], {
      encoding: 'utf8',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: { ...process.env, HS_BUDDY_TEST_BASH_TEMP: directory.replaceAll('\\', '/') },
    })
  } catch (error: unknown) {
    result = { status: null, stdout: null, error }
  }
  try {
    removeProbeDirectory(directory)
  } catch (error: unknown) {
    if (!result.error) result = { ...result, error }
  }
  return result
}

function isCompatible(result: ProbeResult): boolean {
  return !result.error && result.status === 0 && result.stdout === expectedOutput
}

function candidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform !== 'win32') return ['bash']
  const roots = [
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, 'Programs') : undefined,
  ]
  const paths = [
    ...(env.PATH ?? env.Path ?? '')
      .split(';')
      .filter(Boolean)
      .map(root => win32.join(root, 'bash.exe')),
    ...roots
      .filter((root): root is string => !!root)
      .map(root => win32.join(root, 'Git/bin/bash.exe')),
  ]
  const seen = new Set<string>()
  return paths.filter(path => {
    const key = path.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Select using the same -c quoting and temporary-file operations as the release probes. */
export function selectTestBash({
  platform = process.platform,
  env = process.env,
  probe = nativeProbe,
  now = () => performance.now(),
}: Options = {}): string {
  const deadline = now() + 15_000
  for (const executable of candidates(platform, env)) {
    const remaining = Math.floor(deadline - now())
    if (remaining <= 0) break
    const result = probe(executable, Math.min(5000, remaining))
    if (now() > deadline) break
    if (isCompatible(result)) return executable
  }
  throw new Error(
    'Release-workflow tests require Bash that preserves -c quoting and supports mktemp, cat and rm. ' +
      'On Windows install Git for Windows with Git Bash (including Git/bin/bash.exe); ' +
      'on Linux/macOS install Bash on PATH. Discovery has a shared 15-second budget; ' +
      'a successful bash --version alone is insufficient.'
  )
}
