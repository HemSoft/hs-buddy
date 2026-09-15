// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../electron/electron-env.d.ts" />

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect, FIXTURE_FILE_CONTENT, FIXTURE_FILE_NAME } from './electron-fixtures'

test.describe('real Electron renderer-to-main journeys', () => {
  test('persists configuration inside the isolated user-data directory', async ({
    electronHarness,
  }) => {
    const { page, userDataDir } = electronHarness
    const result = await page.evaluate(async () => {
      const saved = await window.ipcRenderer.invoke('config:set-theme', 'light')
      const theme = await window.ipcRenderer.invoke('config:get-theme')
      const storePath = await window.ipcRenderer.invoke('config:get-store-path')
      return { saved, storePath, theme }
    })

    expect(result.saved).toEqual({ success: true })
    expect(result.theme).toBe('light')
    expect(path.relative(userDataDir, result.storePath)).not.toMatch(/^\.\.(?:[\\/]|$)/)

    const storedConfig = JSON.parse(await readFile(result.storePath, 'utf8')) as {
      ui?: { theme?: string }
    }
    expect(storedConfig.ui?.theme).toBe('light')
  })

  test('reads deterministic files through the preload filesystem bridge', async ({
    electronHarness,
  }) => {
    const { fixtureRoot, page } = electronHarness
    const result = await page.evaluate(
      async ({ directory, fileName }) => {
        const directoryResult = await window.filesystem.readDir(directory)
        const fileResult = await window.filesystem.readFile(`${directory}/${fileName}`)
        return { directoryResult, fileResult }
      },
      { directory: fixtureRoot.replaceAll('\\', '/'), fileName: FIXTURE_FILE_NAME }
    )

    expect(result.directoryResult.error).toBeUndefined()
    expect(result.directoryResult.entries).toEqual([
      expect.objectContaining({ name: FIXTURE_FILE_NAME, type: 'file' }),
    ])
    expect(result.fileResult).toEqual({
      content: FIXTURE_FILE_CONTENT,
      language: 'plaintext',
      size: Buffer.byteLength(FIXTURE_FILE_CONTENT),
    })
  })

  test('spawns, writes, resizes, and kills a native terminal session', async ({
    electronHarness,
  }) => {
    const { fixtureRoot, page } = electronHarness
    const marker = '__BUDDY_ELECTRON_TERMINAL_OK__'
    const sizeMarker = '__BUDDY_SIZE__'
    const command =
      process.platform === 'win32'
        ? `Write-Output '${marker}'; $s=$Host.UI.RawUI.WindowSize; Write-Output "${sizeMarker}$($s.Width)x$($s.Height)"`
        : `echo '${marker}'; printf '${sizeMarker}'; stty size`
    const expectedSize =
      process.platform === 'win32' ? `${sizeMarker}100x32` : `${sizeMarker}32 100`
    const spawnResult = await page.evaluate(
      cwd => window.terminal.spawn({ cwd, cols: 80, rows: 24 }),
      fixtureRoot
    )

    expect(spawnResult.success, spawnResult.error).toBe(true)
    expect(spawnResult.sessionId).toEqual(expect.any(String))
    const sessionId = spawnResult.sessionId!

    try {
      await page.evaluate(
        ({ id, terminalCommand }) => {
          window.terminal.resize(id, 100, 32)
          window.terminal.write(id, `${terminalCommand}\r`)
        },
        { id: sessionId, terminalCommand: command }
      )

      await expect
        .poll(
          async () => {
            const attached = await page.evaluate(id => window.terminal.attach(id), sessionId)
            expect(attached.success, attached.error).toBe(true)
            return attached.buffer ?? ''
          },
          { timeout: 15_000 }
        )
        .toContain(expectedSize)

      const output = await page.evaluate(id => window.terminal.attach(id), sessionId)
      expect(output.buffer).toContain(marker)
      expect(await page.evaluate(id => window.terminal.kill(id), sessionId)).toEqual({
        success: true,
      })
      expect(await page.evaluate(id => window.terminal.attach(id), sessionId)).toEqual({
        success: false,
        error: 'Session not found',
      })
    } finally {
      await page.evaluate(id => window.terminal.kill(id), sessionId)
    }
  })
})
