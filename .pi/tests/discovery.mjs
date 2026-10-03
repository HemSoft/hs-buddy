import assert from 'node:assert/strict'
import console from 'node:console'
import process from 'node:process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

const sdkPath = process.argv[2]
assert.ok(sdkPath, 'Supply the installed Pi SDK entry-file path')
const { DefaultResourceLoader, SettingsManager } = await import(
  pathToFileURL(resolve(sdkPath)).href
)
const root = fileURLToPath(new URL('../../', import.meta.url))
const extensionPath = resolve(root, '.pi/extensions/done-sound.ts')
const agentDir = await mkdtemp(join(tmpdir(), 'buddy-pi-discovery-'))

async function discover(cwd) {
  const settingsManager = SettingsManager.inMemory()
  // Trust only this test's repository resources; no global trust/settings change.
  settingsManager.setProjectTrusted(true)
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  })
  await loader.reload()
  const result = loader.getExtensions()
  assert.deepEqual(result.errors, [])
  return result.extensions.find(extension => resolve(extension.resolvedPath) === extensionPath)
}

try {
  const loaded = await discover(root)
  assert.ok(loaded, 'Root startup must discover the repository extension')
  assert.equal(loaded.handlers.get('agent_settled')?.length, 1)
  assert.equal(
    await discover(join(root, 'scripts')),
    undefined,
    'Subfolder startup is not supported'
  )
  console.log(
    'Real Pi discovery verified: root loads one settled handler; subfolder does not load it.'
  )
} finally {
  await rm(agentDir, { recursive: true, force: true })
}
