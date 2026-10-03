import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, URL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { setImmediate } from 'node:timers'
import { test } from 'node:test'
import process from 'node:process'
import doneSound, { belongsToRepository } from '../extensions/done-sound.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const success = { code: 0, killed: false, stdout: '', stderr: '' }

// PowerShell is installed on the host, not an npm package binary.
const powerShellName = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh'
const powerShell = (process.env.PATH ?? '')
  .split(delimiter)
  .map(directory => join(directory, powerShellName))
  .find(candidate => existsSync(candidate))

function harness(exec = async () => success) {
  const handlers = new Map()
  const calls = []
  const warnings = []
  doneSound({
    on: (name, handler) => handlers.set(name, handler),
    exec: async (...args) => {
      calls.push(args)
      return exec(...args)
    },
  })
  const ctx = {
    cwd: root,
    mode: 'tui',
    hasUI: true,
    ui: { notify: (...args) => warnings.push(args) },
  }
  return { handlers, calls, warnings, ctx, settle: () => handlers.get('agent_settled')({}, ctx) }
}

test("only the fully settled event plays the repository's clip", async () => {
  const h = harness()
  assert.deepEqual([...h.handlers.keys()], ['agent_settled'])
  await h.settle()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0][0], 'pwsh')
  assert.deepEqual(h.calls[0][1], [
    '-NoProfile',
    '-File',
    join(root, 'scripts', 'Play-DoneSound.ps1'),
    '-AudioPath',
    'assets/done.mp3',
  ])
  assert.equal(h.calls[0][2].timeout, 15000)
  assert.deepEqual(h.warnings, [])
})

test('an already-loaded hook allows subfolders but excludes other and nested repositories', () => {
  assert.equal(belongsToRepository(root), true)
  assert.equal(belongsToRepository(join(root, 'scripts')), true)
  assert.equal(belongsToRepository(tmpdir()), false)
  assert.equal(belongsToRepository(join(tmpdir(), 'missing-done-sound-directory')), false)
  const nested = mkdtempSync(join(root, '.pi', 'tests', 'nested-'))
  try {
    writeFileSync(join(nested, '.git'), 'gitdir: elsewhere')
    assert.equal(belongsToRepository(nested), false)
  } finally {
    rmSync(nested, { recursive: true, force: true })
  }
})

test('no sound for RPC, headless children, other repositories, or a muted session', async () => {
  const h = harness()
  for (const mode of ['rpc', 'json', 'print']) {
    h.ctx.mode = mode
    // RPC deliberately has UI; hasUI alone must not enable audio.
    h.ctx.hasUI = mode === 'rpc'
    await h.settle()
  }
  h.ctx.mode = 'tui'
  h.ctx.hasUI = true
  h.ctx.cwd = tmpdir()
  await h.settle()
  h.ctx.cwd = root
  const previous = process.env.GENERATE_AUDIO_DONE_SOUND
  try {
    process.env.GENERATE_AUDIO_DONE_SOUND = '0'
    await h.settle()
  } finally {
    if (previous === undefined) delete process.env.GENERATE_AUDIO_DONE_SOUND
    else process.env.GENERATE_AUDIO_DONE_SOUND = previous
  }
  assert.equal(h.calls.length, 0)
})

test('playback failures warn without failing task completion', async () => {
  for (const exec of [
    async () => ({ ...success, code: 1 }),
    async () => {
      throw new Error('missing player')
    },
  ]) {
    const h = harness(exec)
    h.settle()
    await new Promise(resolve => setImmediate(resolve))
    h.settle()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.calls.length, 2)
    assert.equal(h.warnings.length, 2)
    assert.equal(h.warnings[0][1], 'warning')
  }
})

test('settled handler returns before playback and overlapping events cannot start two players', async () => {
  let finish
  const pending = new Promise(resolve => {
    finish = resolve
  })
  const h = harness(() => pending)
  assert.equal(h.settle(), undefined)
  await h.settle()
  assert.equal(h.calls.length, 1)
  finish(success)
  await new Promise(resolve => setImmediate(resolve))
  await h.settle()
  assert.equal(h.calls.length, 2)
})

test('PowerShell plays the asset without a window and reports player failures', () => {
  assert.ok(powerShell, 'Install PowerShell 7 on PATH to run playback integration tests')
  const directory = mkdtempSync(join(tmpdir(), 'done-sound-'))
  try {
    const player = join(directory, 'mock-player.ps1')
    const wrapper = join(directory, 'wrapper.ps1')
    const argumentsFile = join(directory, 'arguments.json')
    writeFileSync(
      player,
      `@($args) | ConvertTo-Json | Set-Content -LiteralPath $env:DONE_SOUND_TEST_ARGS\nexit ([int]$env:DONE_SOUND_TEST_EXIT)\n`
    )
    writeFileSync(
      wrapper,
      `param($TargetScript, $MockPlayer)\nfunction Get-Command {\n    param($Name, $CommandType, $ErrorAction)\n    if ($Name -notin @('ffplay', 'afplay')) { throw 'Unexpected player' }\n    return [pscustomobject]@{ Path = $MockPlayer }\n}\n& $TargetScript\n`
    )
    for (const code of [0, 7]) {
      const result = spawnSync(
        powerShell,
        [
          '-NoProfile',
          '-File',
          wrapper,
          '-TargetScript',
          join(root, 'scripts', 'Play-DoneSound.ps1'),
          '-MockPlayer',
          player,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            OPENROUTER_API_KEY: '',
            DONE_SOUND_TEST_ARGS: argumentsFile,
            DONE_SOUND_TEST_EXIT: String(code),
          },
        }
      )
      assert.ifError(result.error)
      if (code === 0) {
        assert.equal(result.status, 0, result.stderr)
        const args = JSON.parse(readFileSync(argumentsFile, 'utf8').replace(/^\uFEFF/, ''))
        const expected =
          process.platform === 'darwin'
            ? [join(root, 'assets', 'done.mp3')]
            : ['-nodisp', '-autoexit', '-loglevel', 'error', join(root, 'assets', 'done.mp3')]
        assert.deepEqual(Array.isArray(args) ? args : [args], expected)
      } else {
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /player failed with exit code 7/)
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
