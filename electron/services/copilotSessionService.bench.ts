// @vitest-environment node
import { bench, describe, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { resolveWorkspaceName } from './copilotSessionService'

// ─── Fixture generation ───────────────────────────────────
// Creates realistic VS Code workspace.json files matching the formats
// resolveWorkspaceName handles: single-folder, multi-root, and missing/broken.

const tmpDir = path.join(os.tmpdir(), `buddy-bench-workspace-${process.pid}`)

const fixtures: Record<string, string> = {}

function writeWorkspaceFixture(name: string, content: string): string {
  const dir = path.join(tmpDir, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'workspace.json'), content)
  fixtures[name] = dir
  return dir
}

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true })

  // Single-folder workspace (most common)
  writeWorkspaceFixture(
    'single-folder',
    JSON.stringify({
      folder: 'file:///d%3A/github/Relias/hs-buddy',
    })
  )

  // Multi-root workspace
  writeWorkspaceFixture(
    'multi-root',
    JSON.stringify({
      workspace: 'file:///d%3A/projects/my-workspace.code-workspace',
    })
  )

  // Deeply encoded URI (spaces, special chars)
  writeWorkspaceFixture(
    'encoded-uri',
    JSON.stringify({
      folder: 'file:///c%3A/Users/Dev%20User/Documents/My%20Projects/some-app',
    })
  )

  // Empty JSON (fallback to dirname)
  writeWorkspaceFixture('empty-json', JSON.stringify({}))

  // Missing workspace.json (fallback to dirname via catch)
  const noFileDir = path.join(tmpDir, 'no-file')
  fs.mkdirSync(noFileDir, { recursive: true })
  const stale = path.join(noFileDir, 'workspace.json')
  if (fs.existsSync(stale)) fs.unlinkSync(stale)
  fixtures['no-file'] = noFileDir
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Benchmarks ───────────────────────────────────────────

describe('resolveWorkspaceName', () => {
  bench('single-folder workspace', () => {
    resolveWorkspaceName(fixtures['single-folder'])
  })

  bench('multi-root workspace', () => {
    resolveWorkspaceName(fixtures['multi-root'])
  })

  bench('encoded URI with spaces', () => {
    resolveWorkspaceName(fixtures['encoded-uri'])
  })

  bench('empty JSON (fallback to dirname)', () => {
    resolveWorkspaceName(fixtures['empty-json'])
  })

  bench('missing file (catch path)', () => {
    resolveWorkspaceName(fixtures['no-file'])
  })
})
