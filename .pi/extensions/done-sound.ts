import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const repositoryRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
const playbackScript = join(repositoryRoot, 'scripts', 'Play-DoneSound.ps1')
const configPath = join(repositoryRoot, '.pi', 'done-sound.json')

// Check real paths and stop at a nested repository boundary.
export function belongsToRepository(cwd: string): boolean {
  try {
    let directory = realpathSync(cwd)
    while (true) {
      if (directory === repositoryRoot) return true
      if (existsSync(join(directory, '.git'))) return false
      const parent = dirname(directory)
      if (parent === directory) return false
      directory = parent
    }
  } catch (_: unknown) {
    return false
  }
}

function configuredAudioPath(): string | undefined {
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  if (
    config.version !== 1 ||
    config.managedBy !== 'generate-audio' ||
    typeof config.audioPath !== 'string'
  ) {
    throw new Error('Invalid completion audio configuration')
  }
  return config.enabled === false ? undefined : config.audioPath
}

export default function doneSound(pi: ExtensionAPI) {
  let playing = false

  // Unlike agent_end, this runs only after retries and queued follow-ups finish.
  pi.on('agent_settled', (_event, ctx) => {
    if (
      ctx.mode !== 'tui' ||
      process.env.GENERATE_AUDIO_DONE_SOUND === '0' ||
      playing ||
      !belongsToRepository(ctx.cwd)
    )
      return

    playing = true
    // Notification-only work must not hold up the settled event.
    void play()

    async function play() {
      try {
        const audioPath = configuredAudioPath()
        if (audioPath === undefined) return
        const result = await pi.exec(
          'pwsh',
          ['-NoProfile', '-File', playbackScript, '-AudioPath', audioPath],
          {
            cwd: repositoryRoot,
            timeout: 15000,
          }
        )
        if (result.code !== 0 || result.killed) {
          ctx.ui.notify(
            'Completion audio could not play. Check the audio player and configured file.',
            'warning'
          )
        }
      } catch (_: unknown) {
        ctx.ui.notify(
          'Completion audio could not start. Check PowerShell and the audio player.',
          'warning'
        )
      } finally {
        playing = false
      }
    }
  })
}
