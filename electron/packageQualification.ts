import { accessSync, constants } from 'node:fs'
import { dirname, join } from 'node:path'

const PACKAGE_NATIVE_MODULES = [
  { dependency: 'node-pty', binding: 'spawn' },
  { dependency: 'koffi', binding: 'load' },
] as const

export interface PackageDependencyReport {
  nativeModules: string[]
  copilotPackage: string
  copilotBinary: string
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
  const resolvedPackage = resolveModule(copilotPackage)
  if (!resolvedPackage.trim()) throw new Error(`${copilotPackage} resolved to an empty path`)

  const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot'
  const copilotBinary = join(dirname(resolvedPackage), binaryName)
  verifyExecutable(copilotBinary)

  return {
    nativeModules: PACKAGE_NATIVE_MODULES.map(module => module.dependency),
    copilotPackage,
    copilotBinary,
  }
}
