/**
 * Shared logic for bootstrapping the Aspire AppHost from scripts/setup.ts.
 *
 * Kept dependency-free and side-effect-free so it can be unit tested.
 */

export function readPinnedSdkVersion(configJson: string): string | undefined {
  try {
    const config = JSON.parse(configJson) as { sdk?: { version?: string } }
    const version = config.sdk?.version
    return typeof version === 'string' && version.trim() !== '' ? version : undefined
  } catch (_: unknown) {
    return undefined
  }
}

export type VersionAlignment = 'match' | 'mismatch' | 'unknown' | 'unpinned'

export function describeVersionAlignment(
  expected: string | undefined,
  actual: string | undefined
): VersionAlignment {
  if (expected === undefined) return 'unpinned'
  if (actual === undefined) return 'unknown'
  return actual === expected ? 'match' : 'mismatch'
}

/**
 * Windows exposes dotnet-tool CLIs as .cmd shims that spawnSync cannot execute
 * without a shell (Node rejects .cmd/.bat targets outright); POSIX keeps the
 * direct spawn so arguments stay free of shell interpretation.
 */
export function shouldSpawnThroughShell(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}
