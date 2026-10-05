import { spawnSync } from 'node:child_process'
import { win32 } from 'node:path'

const expectedOutput = 'hs-buddy-bash-compatible\n'
const probeSource = `set -eu
counter="$(mktemp)"
trap 'rm -f "$counter"' EXIT
printf '%s' 'buddy "quoted" $literal' > "$counter"
actual="$(cat "$counter")"
[ "$actual" = 'buddy "quoted" $literal' ]
printf '%s\\n' 'hs-buddy-bash-compatible'`

type ProbeResult = { status: number | null; stdout: string | null; error?: unknown }
type Options = {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  probe?: (executable: string) => ProbeResult
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
  probe = executable =>
    spawnSync(executable, ['-c', probeSource], {
      encoding: 'utf8',
      timeout: 5000,
    }),
}: Options = {}): string {
  for (const executable of candidates(platform, env)) {
    const result = probe(executable)
    if (!result.error && result.status === 0 && result.stdout === expectedOutput) return executable
  }
  throw new Error(
    'Release-workflow tests require Bash that preserves -c quoting and supports mktemp, cat and rm. ' +
      'On Windows install Git for Windows with Git Bash (including Git/bin/bash.exe); ' +
      'on Linux/macOS install Bash on PATH. A successful bash --version alone is insufficient.'
  )
}
