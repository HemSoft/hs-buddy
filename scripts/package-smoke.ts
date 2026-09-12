import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const [expectedPlatform, expectedArch] = process.argv.slice(2)
const supportedPlatforms = new Set(['win32', 'linux', 'darwin'])
const supportedArchitectures = new Set(['x64', 'arm64'])

if (!expectedPlatform || !supportedPlatforms.has(expectedPlatform)) {
  throw new Error('Usage: bun scripts/package-smoke.ts <win32|linux|darwin> <x64|arm64>')
}
if (!expectedArch || !supportedArchitectures.has(expectedArch)) {
  throw new Error('Expected architecture must be x64 or arm64')
}

const releaseRoot = resolve('release')
const smokeOutput = join(releaseRoot, 'package-smoke-result.json')
const smokeUserData = join(releaseRoot, 'package-smoke-user-data')
const logPath = join(releaseRoot, 'package-smoke.log')
mkdirSync(releaseRoot, { recursive: true })
rmSync(smokeOutput, { force: true })
rmSync(smokeUserData, { force: true, recursive: true })

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return []

  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const entryPath = join(directory, entry)
    if (statSync(entryPath).isDirectory()) files.push(...listFiles(entryPath))
    else files.push(entryPath)
  }
  return files
}

function isPackagedExecutable(file: string): boolean {
  const normalized = file.replaceAll('\\', '/')
  if (expectedPlatform === 'win32') return normalized.endsWith('/win-unpacked/Buddy.exe')
  if (expectedPlatform === 'linux') return /\/linux-unpacked\/(?:buddy|Buddy)$/.test(normalized)
  return normalized.endsWith('/Buddy.app/Contents/MacOS/Buddy')
}

const packagedFiles = listFiles(releaseRoot)
const executable = packagedFiles.find(isPackagedExecutable)
if (!executable) {
  throw new Error(
    `No unpacked Buddy executable found for ${expectedPlatform}-${expectedArch}. Package contents:\n${packagedFiles.join('\n')}`
  )
}

const launchCommand = expectedPlatform === 'linux' ? 'xvfb-run' : executable
const appArguments = [`--user-data-dir=${smokeUserData}`]
const launchArguments =
  expectedPlatform === 'linux'
    ? ['--auto-servernum', executable, '--no-sandbox', ...appArguments]
    : appArguments
const output: string[] = [
  `Qualifying ${expectedPlatform}-${expectedArch}`,
  `Executable: ${executable}`,
  `Command: ${launchCommand} ${launchArguments.join(' ')}`,
]

const child = spawn(launchCommand, launchArguments, {
  env: {
    ...process.env,
    BUDDY_PACKAGE_SMOKE_FILE: smokeOutput,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', chunk => output.push(`[stdout] ${String(chunk).trimEnd()}`))
child.stderr.on('data', chunk => output.push(`[stderr] ${String(chunk).trimEnd()}`))

const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
  (resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Packaged app did not complete its startup smoke test within 60 seconds'))
    }, 60_000)

    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      resolveExit({ code, signal })
    })
  }
)

output.push(`Exit: code=${String(exitResult.code)} signal=${String(exitResult.signal)}`)

try {
  if (!existsSync(smokeOutput))
    throw new Error('Packaged app exited without writing a smoke result')

  const result = JSON.parse(readFileSync(smokeOutput, 'utf8')) as {
    ok?: boolean
    platform?: string
    arch?: string
    rendererLoaded?: boolean
    nativeModules?: string[]
    copilotPackage?: string
    error?: string
  }
  output.push(`Result: ${JSON.stringify(result)}`)

  if (exitResult.code !== 0 || !result.ok) {
    throw new Error(result.error ?? `Packaged app exited with code ${String(exitResult.code)}`)
  }
  if (result.platform !== expectedPlatform || result.arch !== expectedArch) {
    throw new Error(
      `Runtime was ${String(result.platform)}-${String(result.arch)}, expected ${expectedPlatform}-${expectedArch}`
    )
  }
  if (!result.rendererLoaded) throw new Error('Packaged renderer did not load')
  for (const dependency of ['node-pty', 'koffi']) {
    if (!result.nativeModules?.includes(dependency)) {
      throw new Error(`Packaged native module did not load: ${dependency}`)
    }
  }
  if (!result.copilotPackage?.includes(`copilot-${expectedPlatform}-${expectedArch}`)) {
    throw new Error('Packaged Copilot binary does not match the runtime platform and architecture')
  }

  output.push('Package startup qualification passed.')
} catch (error: unknown) {
  const packageListing = packagedFiles.slice(0, 200)
  output.push(
    `FAILURE: ${String(error)}`,
    `Package contents (${packagedFiles.length} files; first ${packageListing.length}):`,
    ...packageListing
  )
  throw error
} finally {
  writeFileSync(logPath, `${output.join('\n')}\n`)
  console.log(output.join('\n'))
}
