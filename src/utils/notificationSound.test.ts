import { describe, expect, it } from 'vitest'
import {
  createNotificationSoundBlob,
  getNotificationSoundMimeType,
  isSupportedNotificationSoundPath,
  MAX_NOTIFICATION_SOUND_BYTES,
} from './notificationSound'

describe('notificationSound', () => {
  describe('MAX_NOTIFICATION_SOUND_BYTES', () => {
    it('equals 5 MB', () => {
      expect(MAX_NOTIFICATION_SOUND_BYTES).toBe(5 * 1024 * 1024)
    })
  })

  describe('getNotificationSoundMimeType', () => {
    it.each([
      ['ding.mp3', 'audio/mpeg'],
      ['ding.wav', 'audio/wav'],
      ['ding.ogg', 'audio/ogg'],
      ['ding.flac', 'audio/flac'],
      ['ding.aac', 'audio/aac'],
      ['ding.m4a', 'audio/mp4'],
    ])('returns correct MIME for %s', (path, expected) => {
      expect(getNotificationSoundMimeType(path)).toBe(expected)
    })

    it('is case-insensitive for extensions', () => {
      expect(getNotificationSoundMimeType('ding.MP3')).toBe('audio/mpeg')
      expect(getNotificationSoundMimeType('ding.Wav')).toBe('audio/wav')
      expect(getNotificationSoundMimeType('ding.OGG')).toBe('audio/ogg')
    })

    it('returns fallback for file with no extension (no dot)', () => {
      expect(getNotificationSoundMimeType('soundfile')).toBe('application/octet-stream')
    })

    it('returns fallback for unsupported extension', () => {
      expect(getNotificationSoundMimeType('ding.xyz')).toBe('application/octet-stream')
      expect(getNotificationSoundMimeType('ding.txt')).toBe('application/octet-stream')
    })

    it('handles paths with directories', () => {
      expect(getNotificationSoundMimeType('C:/sounds/sub.dir/ding.mp3')).toBe('audio/mpeg')
    })
  })

  describe('isSupportedNotificationSoundPath', () => {
    it.each(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'])(
      'returns true for %s extension',
      ext => {
        expect(isSupportedNotificationSoundPath(`ding${ext}`)).toBe(true)
      }
    )

    it('is case-insensitive', () => {
      expect(isSupportedNotificationSoundPath('ding.MP3')).toBe(true)
      expect(isSupportedNotificationSoundPath('ding.Flac')).toBe(true)
    })

    it('returns false for unsupported extension', () => {
      expect(isSupportedNotificationSoundPath('ding.txt')).toBe(false)
      expect(isSupportedNotificationSoundPath('ding.exe')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isSupportedNotificationSoundPath('')).toBe(false)
    })

    it('returns false for whitespace-only string', () => {
      expect(isSupportedNotificationSoundPath('   ')).toBe(false)
    })

    it('returns false for non-string input', () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      expect(isSupportedNotificationSoundPath(null as any)).toBe(false)
      expect(isSupportedNotificationSoundPath(undefined as any)).toBe(false)
      expect(isSupportedNotificationSoundPath(123 as any)).toBe(false)
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })

    it('returns false for path with no extension (no dot)', () => {
      expect(isSupportedNotificationSoundPath('soundfile')).toBe(false)
      expect(isSupportedNotificationSoundPath('/path/to/soundfile')).toBe(false)
    })
  })

  describe('createNotificationSoundBlob', () => {
    it('creates a Blob with the correct MIME type', () => {
      const blob = createNotificationSoundBlob({ base64: 'AQID', mimeType: 'audio/wav' })
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('audio/wav')
    })

    it('decodes base64 data into correct bytes', async () => {
      const blob = createNotificationSoundBlob({ base64: 'AQID', mimeType: 'audio/wav' })
      const buffer = await blob.arrayBuffer()
      expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]))
    })

    it('handles empty base64 string', () => {
      const blob = createNotificationSoundBlob({ base64: '', mimeType: 'audio/mp3' })
      expect(blob.size).toBe(0)
    })

    it('preserves arbitrary MIME types', () => {
      const blob = createNotificationSoundBlob({ base64: 'AA==', mimeType: 'audio/ogg' })
      expect(blob.type).toBe('audio/ogg')
    })
  })
})
