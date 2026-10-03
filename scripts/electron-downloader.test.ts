import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it.each(['uppercase', 'lowercase', 'no-proxy'])(
  'preserves proxy routing and the request timeout with Electron get 5: %s',
  mode => {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/fixtures/electron-downloader-probe.mjs'), mode],
      {
        encoding: 'utf8',
        timeout: 15000,
      }
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(result.stdout).toContain('BUDDY_DOWNLOADER_PROBE_PASS')
  },
  20000
)
