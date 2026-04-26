/**
 * Platform-aware environment variable resolution.
 *
 * On Windows, some tokens are stored in Machine scope and the parent
 * terminal's process.env may hold a stale copy. This module provides
 * pure predicates to decide _when_ to check Machine scope, while the
 * actual execSync call stays in the caller (electron layer).
 *
 * Used by both tempoClient and todoistClient.
 */

/**
 * Returns true when the env var should be read from Windows Machine scope
 * before falling back to process.env.
 */
export function shouldCheckWindowsMachineScope(
  platform: string,
  name: string,
  allowedNames: Set<string>
): boolean {
  return platform === 'win32' && allowedNames.has(name)
}

/**
 * Build the PowerShell command to read a Machine-scope environment variable.
 * The name is validated against an allow-list before this function is called,
 * so injection risk is mitigated at the call site.
 */
export function buildPowershellEnvCommand(name: string): string {
  const escaped = name.replace(/'/g, "''")
  return `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${escaped}','Machine')"`
}

/** Dependency-injected shell executor for resolveEnvVar. */
type ExecSyncFn = (command: string) => string

/**
 * Resolve an environment variable with optional Windows Machine-scope lookup.
 *
 * Pure function: all I/O and platform dependencies are injected.
 * Returns the resolved value (from Machine scope, then env), or undefined.
 */
export function resolveEnvVar(
  name: string,
  cache: Map<string, string>,
  platform: string,
  allowedNames: Set<string>,
  env: Record<string, string | undefined>,
  execSyncFn: ExecSyncFn
): string | undefined {
  if (cache.has(name)) return cache.get(name)

  if (shouldCheckWindowsMachineScope(platform, name, allowedNames)) {
    try {
      const val = execSyncFn(buildPowershellEnvCommand(name)).trim()
      if (val) {
        cache.set(name, val)
        return val
      }
    } catch {
      /* fall through to process.env */
    }
  }

  const val = env[name]
  if (val) {
    cache.set(name, val)
    return val
  }
  return undefined
}

/**
 * Create a pre-configured env resolver bound to specific allowed names and platform.
 *
 * Returns a `getEnv(name)` function that caches resolved values.
 */
export function createEnvResolver(
  platform: string,
  allowedNames: Set<string>,
  env: Record<string, string | undefined>,
  execSyncFn: ExecSyncFn
): (name: string) => string | undefined {
  const cache = new Map<string, string>()
  return (name: string) => resolveEnvVar(name, cache, platform, allowedNames, env, execSyncFn)
}
