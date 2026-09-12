const PACKAGE_NATIVE_MODULES = ['node-pty', 'koffi'] as const

export interface PackageDependencyReport {
  nativeModules: string[]
  copilotPackage: string
}

/** Load every native dependency from the packaged Electron runtime. */
export function qualifyPackageDependencies(
  platform: NodeJS.Platform,
  arch: string,
  loadModule: (specifier: string) => unknown,
  resolveModule: (specifier: string) => string
): PackageDependencyReport {
  for (const dependency of PACKAGE_NATIVE_MODULES) loadModule(dependency)

  const copilotPackage = `@github/copilot-${platform}-${arch}`
  resolveModule(copilotPackage)

  return { nativeModules: [...PACKAGE_NATIVE_MODULES], copilotPackage }
}
