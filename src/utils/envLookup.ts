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
