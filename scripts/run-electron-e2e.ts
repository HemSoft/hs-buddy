import { spawn, type ChildProcess } from 'node:child_process'
import { electronE2EEnvironment } from '../e2e/electron-environment'

let activeProcess: ChildProcess | undefined

process.once('SIGINT', () => activeProcess?.kill('SIGINT'))
process.once('SIGTERM', () => activeProcess?.kill('SIGTERM'))

async function run(args: string[], environment: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  })
  activeProcess = child

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
  activeProcess = undefined
  return exitCode
}

const environment = electronE2EEnvironment({
  VITE_CONVEX_URL: 'http://127.0.0.1:9',
})

const buildExitCode = await run(['x', 'vite', 'build', '--mode', 'electron-e2e'], environment)
if (buildExitCode !== 0) process.exit(buildExitCode)

process.exitCode = await run(
  ['x', 'playwright', 'test', '--project=electron-e2e', ...process.argv.slice(2)],
  environment
)
