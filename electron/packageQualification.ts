import { accessSync, constants } from 'node:fs'
import { posix, win32 } from 'node:path'

const PACKAGE_NATIVE_MODULES = [
  { dependency: 'node-pty', binding: 'spawn' },
  { dependency: 'koffi', binding: 'load' },
] as const

export interface PackageDependencyReport {
  nativeModules: string[]
  copilotPackage: string
  copilotBinary: string
}

export interface PackageSmokeResult extends Record<string, unknown> {
  ok: boolean
  platform: NodeJS.Platform
  arch: string
  error?: string
}

function assertExecutable(file: string): void {
  accessSync(file, constants.X_OK)
}

export function requireMountedRenderer(rendererLoaded: unknown): true {
  if (rendererLoaded !== true) throw new Error('Renderer did not mount into #root')
  return true
}

/** Load every native dependency from the packaged Electron runtime. */
export function qualifyPackageDependencies(
  platform: NodeJS.Platform,
  arch: string,
  loadModule: (specifier: string) => unknown,
  resolveModule: (specifier: string) => string,
  verifyExecutable: (file: string) => void = assertExecutable
): PackageDependencyReport {
  for (const { dependency, binding } of PACKAGE_NATIVE_MODULES) {
    const loaded = loadModule(dependency)
    if (
      (typeof loaded !== 'object' && typeof loaded !== 'function') ||
      loaded === null ||
      typeof (loaded as Record<string, unknown>)[binding] !== 'function'
    ) {
      throw new Error(`${dependency} loaded without its ${binding} binding`)
    }
  }

  const copilotPackage = `@github/copilot-${platform}-${arch}`
  const resolvedManifest = resolveModule(`${copilotPackage}/package.json`)
  if (!resolvedManifest.trim()) throw new Error(`${copilotPackage} resolved to an empty path`)

  const targetPath = platform === 'win32' ? win32 : posix
  const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot'
  const copilotBinary = targetPath.join(targetPath.dirname(resolvedManifest), binaryName)
  verifyExecutable(copilotBinary)

  return {
    nativeModules: PACKAGE_NATIVE_MODULES.map(module => module.dependency),
    copilotPackage,
    copilotBinary,
  }
}

export async function persistPackageSmokeResult(
  getResult: () => Promise<PackageSmokeResult>,
  writeResult: (result: PackageSmokeResult) => Promise<void>,
  exit: (code: number) => void
): Promise<void> {
  let exitCode = 0
  let result: PackageSmokeResult
  try {
    result = await getResult()
  } catch (error: unknown) {
    exitCode = 1
    result = {
      ok: false,
      platform: process.platform,
      arch: process.arch,
      error: String(error),
    }
  }

  try {
    await writeResult(result)
  } finally {
    exit(exitCode)
  }
}
