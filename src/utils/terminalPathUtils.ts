/**
 * Terminal path and parsing helpers — pure functions extracted from
 * electron/ipc/terminalHandlers.ts for testability.
 */

import path from 'node:path'

/** Validates a GitHub-style slug (owner or repo name). */
export function isValidRepoSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)
}

/** Generates organization folder name candidates from the owner string. */
export function getOrgCandidates(owner: string): string[] {
  const candidates = new Set<string>()
  candidates.add(owner)
  const dashIdx = owner.indexOf('-')
  if (dashIdx > 0) {
    const short = owner.substring(0, dashIdx)
    candidates.add(short)
    candidates.add(short.charAt(0).toUpperCase() + short.slice(1))
  }
  candidates.add(owner.charAt(0).toUpperCase() + owner.slice(1))
  return [...candidates]
}

/**
 * Returns clone root directories for a given platform and home directory.
 * On Windows, probes common drive letters; on Unix, probes the drive root.
 */
export function getCloneRoots(platform: string, home: string): string[] {
  const driveRoot = path.parse(home).root
  const roots: string[] = []

  if (platform === 'win32') {
    for (const letter of ['C', 'D', 'E', 'F']) {
      roots.push(path.join(`${letter}:\\`, 'github'))
    }
  } else {
    roots.push(path.join(driveRoot, 'github'))
  }

  roots.push(
    path.join(home, 'github'),
    path.join(home, 'repos'),
    path.join(home, 'projects'),
    path.join(home, 'source', 'repos')
  )

  return roots
}

const MAX_OSC_BUFFER = 512

/**
 * Process OSC 7 CWD sequences from a terminal output buffer.
 *
 * Appends `chunk` to `prevBuffer`, caps at 512 chars, extracts the
 * last OSC 7 CWD path, and returns the remaining buffer for the next
 * call. This is the full buffer state machine extracted from
 * electron/ipc/terminalHandlers.ts `processOsc7()`.
 */
export function processOsc7Buffer(
  prevBuffer: string,
  chunk: string
): { cwd: string | null; remainingBuffer: string } {
  let buffer = prevBuffer + chunk

  if (buffer.length > MAX_OSC_BUFFER) {
    buffer = buffer.slice(-MAX_OSC_BUFFER)
  }

  // eslint-disable-next-line no-control-regex -- intentional terminal escape sequences (OSC 7)
  const osc7Regex = /\x1b\]7;file:\/\/[^/]*(\/.*?)(?:\x07|\x1b\\)/g
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null
  while ((match = osc7Regex.exec(buffer)) !== null) {
    lastMatch = match
  }

  if (!lastMatch) {
    return { cwd: null, remainingBuffer: buffer }
  }

  const remainingBuffer = buffer.slice(lastMatch.index + lastMatch[0].length)

  try {
    const rawPath = lastMatch[1]
    // On Windows, file:///C:/... yields /C:/...; strip the leading slash to get C:/...
    const normalizedPath = /^\/[A-Za-z]:/.test(rawPath) ? rawPath.slice(1) : rawPath
    const cwd = decodeURIComponent(normalizedPath)
    return { cwd, remainingBuffer }
  } catch (_: unknown) {
    return { cwd: null, remainingBuffer }
  }
}

/**
 * Build PTY spawn options from the given config.
 * Accepts platform as a parameter for testability.
 */
export function buildPtySpawnOptions(
  opts: { cols?: number; rows?: number },
  cwd: string,
  env: Record<string, string | undefined>,
  platform: string
): Record<string, unknown> {
  return {
    name: 'xterm-256color',
    cols: opts.cols || 120,
    rows: opts.rows || 30,
    cwd,
    env: { ...env },
    ...(platform === 'win32' ? { useConpty: true } : {}),
  }
}

/**
 * Probe clone roots and org candidates to find a local repo directory.
 * Accepts a predicate for filesystem checks to keep this function pure.
 */
export function findRepoPath(
  cloneRoots: string[],
  orgCandidates: string[],
  repo: string,
  isValidDir: (dir: string) => boolean
): string | null {
  for (const root of cloneRoots) {
    if (!isValidDir(root)) continue

    for (const org of orgCandidates) {
      const candidate = path.join(root, org, repo)
      if (isValidDir(candidate)) return candidate
    }

    const directCandidate = path.join(root, repo)
    if (isValidDir(directCandidate)) return directCandidate
  }

  return null
}

/** Build the PowerShell OSC 7 prompt-injection script. */
function buildPowerShellOsc7Setup(): string {
  return [
    '& { . $PROFILE } 2>$null',
    '$__hsb_op=$function:prompt',
    'function global:prompt{',
    '$e=[char]0x1b',
    "[Console]::Write(\"$e]7;file:///$($PWD.Path.Replace('\\','/'))$e\\\")",
    '& $__hsb_op',
    '}',
  ].join(';')
}

/**
 * Build shell args for the terminal. For Windows PowerShell, generates
 * an encoded command that injects OSC 7 CWD reporting into the prompt.
 */
export function buildTerminalShellArgs(shell: string, platform: string): string[] {
  if (platform === 'win32' && (shell === 'pwsh.exe' || shell === 'powershell.exe')) {
    const osc7Setup = buildPowerShellOsc7Setup()
    const encoded = Buffer.from(osc7Setup, 'utf16le').toString('base64')
    return ['-NoLogo', '-NoExit', '-EncodedCommand', encoded]
  }
  return []
}
