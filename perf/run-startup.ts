/**
 * Startup Performance Runner
 *
 * Spawns the built Electron app with PERF_STARTUP=1, captures the
 * structured timing report from stdout, and exits with the result.
 *
 * Requirements:
 *   - App must be built (`bun run build` or at minimum `vite build`)
 *   - OR a Vite dev server must be running (detected via VITE_DEV_SERVER_URL)
 *
 * Usage:
 *   bun perf/run-startup.ts              # run with defaults
 *   bun perf/run-startup.ts --timeout 10 # custom timeout in seconds
 *   bun perf/run-startup.ts --target 5000 # custom target in ms (default: 3000)
 *
 * Exit codes:
 *   0 = startup within target
 *   1 = startup exceeded target or timed out
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { STARTUP_SENTINEL, type StartupReport } from './startup-timing'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_TIMEOUT_S = 15
const DEFAULT_TARGET_MS = 3000

function requirePositiveNumber(raw: string, flag: string): number {
  const val = Number(raw)
  if (!Number.isFinite(val) || val <= 0) {
    console.error(`❌ ${flag} must be a positive number, got "${raw}"`)
    process.exit(1)
  }
  return val
}

function requireArgValue(args: string[], index: number, flag: string): string {
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    console.error(`❌ ${flag} requires a value`)
    process.exit(1)
  }
  return args[index + 1]
}

function parseArgs(): { timeoutS: number; targetMs: number } {
  const args = process.argv.slice(2)
  let timeoutS = DEFAULT_TIMEOUT_S
  let targetMs = DEFAULT_TARGET_MS

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--timeout') {
      const raw = requireArgValue(args, i, '--timeout')
      timeoutS = requirePositiveNumber(raw, '--timeout')
      i++
    } else if (args[i] === '--target') {
      const raw = requireArgValue(args, i, '--target')
      targetMs = requirePositiveNumber(raw, '--target')
      i++
    } else if (args[i] === '--help') {
      console.log(
        [
          'Usage: bun perf/run-startup.ts [options]',
          '',
          'Options:',
          '  --timeout <seconds>  Max wait time for startup report (default: 15)',
          '  --target <ms>        Target startup time in milliseconds (default: 3000)',
          '  --help               Show this help message',
        ].join('\n')
      )
      process.exit(0)
    }
  }

  return { timeoutS, targetMs }
}

function findElectron(): string {
  // Resolve electron binary from node_modules
  const electronPath = resolve(ROOT, 'node_modules', '.bin', 'electron')
  const electronCmd = process.platform === 'win32' ? `${electronPath}.cmd` : electronPath
  if (!existsSync(electronCmd)) {
    console.error('❌ Electron binary not found. Run `bun install` first.')
    process.exit(1)
  }
  return electronCmd
}

function main(): void {
  const { timeoutS, targetMs } = parseArgs()
  const electronCmd = findElectron()

  // Check that either dist exists (built app) or VITE_DEV_SERVER_URL is set
  const distExists = existsSync(resolve(ROOT, 'dist', 'index.html'))
  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (!distExists && !devServerUrl) {
    console.error('❌ No built app found (dist/index.html missing).')
    console.error('   Run `vite build` first, or set VITE_DEV_SERVER_URL for dev mode.')
    process.exit(1)
  }

  console.log(`⏱️  Measuring startup time (timeout: ${timeoutS}s, target: ${targetMs}ms)...`)
  console.log(`   Electron: ${electronCmd}`)
  console.log(`   Mode: ${devServerUrl ? 'dev server' : 'production build'}\n`)

  const child = spawn(electronCmd, ['.'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PERF_STARTUP: '1',
      PERF_STARTUP_TARGET_MS: String(targetMs),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  let stdout = ''
  let resolved = false

  const timeout = setTimeout(() => {
    if (resolved) return
    resolved = true
    console.error(`\n❌ Timeout: No startup report received within ${timeoutS}s`)
    child.kill()
    process.exit(1)
  }, timeoutS * 1000)

  child.stdout.on('data', (data: Buffer) => {
    const chunk = data.toString()
    stdout += chunk
    process.stdout.write(chunk)

    // Look for the sentinel line
    const sentinelIndex = stdout.indexOf(STARTUP_SENTINEL)
    if (sentinelIndex !== -1 && !resolved) {
      resolved = true
      clearTimeout(timeout)

      const jsonStr = stdout.slice(sentinelIndex + STARTUP_SENTINEL.length).split('\n')[0]
      try {
        const report: StartupReport = JSON.parse(jsonStr)
        console.log(`\n📊 Startup completed in ${report.totalStartupMs.toFixed(0)}ms`)

        if (report.totalStartupMs > targetMs) {
          console.error(
            `❌ FAILED: Exceeds ${targetMs}ms target by ${(report.totalStartupMs - targetMs).toFixed(0)}ms`
          )
          child.kill()
          process.exit(1)
        } else {
          console.log(`✅ PASSED: Within ${targetMs}ms target`)
          child.kill()
          process.exit(0)
        }
      } catch (_: unknown) {
        console.error('❌ Failed to parse startup report JSON')
        child.kill()
        process.exit(1)
      }
    }
  })

  child.stderr.on('data', (data: Buffer) => {
    // Forward stderr but don't treat as failure (Electron emits GPU warnings etc.)
    process.stderr.write(data)
  })

  child.on('exit', code => {
    if (resolved) return
    resolved = true
    clearTimeout(timeout)
    if (code !== 0) {
      console.error(`\n❌ Electron exited with code ${code} before reporting startup time`)
    } else {
      console.error('\n❌ Electron exited without emitting startup report')
    }
    process.exit(1)
  })
}

main()
