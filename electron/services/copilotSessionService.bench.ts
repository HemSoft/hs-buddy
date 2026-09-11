// @vitest-environment node
import { test, describe, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { resolveWorkspaceName } from './copilotSessionService'

// ─── Fixture generation ───────────────────────────────────
// Creates realistic VS Code workspace.json files matching the formats
// resolveWorkspaceName handles: single-folder, multi-root, and missing/broken.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-bench-workspace-'))

const fixtures: Record<string, string> = {}

function writeWorkspaceFixture(name: string, content: string): string {
  const dir = path.join(tmpDir, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'workspace.json'), content)
  fixtures[name] = dir
  return dir
}

beforeAll(() => {
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
  fixtures['no-file'] = noFileDir
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Benchmarks ───────────────────────────────────────────

describe('resolveWorkspaceName', () => {
  test('single-folder workspace', async ({ bench }) => {
    await bench('single-folder workspace', () => {
      resolveWorkspaceName(fixtures['single-folder'])
    }).run()
  })

  test('multi-root workspace', async ({ bench }) => {
    await bench('multi-root workspace', () => {
      resolveWorkspaceName(fixtures['multi-root'])
    }).run()
  })

  test('encoded URI with spaces', async ({ bench }) => {
    await bench('encoded URI with spaces', () => {
      resolveWorkspaceName(fixtures['encoded-uri'])
    }).run()
  })

  test('empty JSON (fallback to dirname)', async ({ bench }) => {
    await bench('empty JSON (fallback to dirname)', () => {
      resolveWorkspaceName(fixtures['empty-json'])
    }).run()
  })

  test('missing file (catch path)', async ({ bench }) => {
    await bench('missing file (catch path)', () => {
      resolveWorkspaceName(fixtures['no-file'])
    }).run()
  })
})
