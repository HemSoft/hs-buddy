import { describe, expect, it } from 'vitest'
import {
  createNotificationSoundBlob,
  getNotificationSoundMimeType,
  isSupportedNotificationSoundPath,
} from './notificationSound'

describe('getNotificationSoundMimeType', () => {
  it('maps supported audio extensions to browser-safe MIME types', () => {
    expect(getNotificationSoundMimeType('C:/sounds/ding.mp3')).toBe('audio/mpeg')
    expect(getNotificationSoundMimeType('C:/sounds/ding.WAV')).toBe('audio/wav')
    expect(getNotificationSoundMimeType('C:/sounds/ding.ogg')).toBe('audio/ogg')
    expect(getNotificationSoundMimeType('C:/sounds/ding.flac')).toBe('audio/flac')
    expect(getNotificationSoundMimeType('C:/sounds/ding.aac')).toBe('audio/aac')
    expect(getNotificationSoundMimeType('C:/sounds/ding.m4a')).toBe('audio/mp4')
  })

  it('falls back when the extension is missing or unsupported', () => {
    expect(getNotificationSoundMimeType('C:/sounds/ding')).toBe('application/octet-stream')
    expect(getNotificationSoundMimeType('C:/sounds/ding.xyz')).toBe('application/octet-stream')
  })

  it('recognizes supported notification sound paths', () => {
    expect(isSupportedNotificationSoundPath('C:/sounds/ding.mp3')).toBe(true)
    expect(isSupportedNotificationSoundPath('C:/sounds/ding.WAV')).toBe(true)
  })

  it('rejects empty and unsupported notification sound paths', () => {
    expect(isSupportedNotificationSoundPath('')).toBe(false)
    expect(isSupportedNotificationSoundPath('   ')).toBe(false)
    expect(isSupportedNotificationSoundPath('C:/sounds/ding.txt')).toBe(false)
  })

  it('creates a blob from a base64-encoded sound asset', async () => {
    const blob = createNotificationSoundBlob({
      base64: 'AQID',
      mimeType: 'audio/wav',
    })

    expect(blob.type).toBe('audio/wav')
    await expect(blob.arrayBuffer()).resolves.toEqual(Uint8Array.from([1, 2, 3]).buffer)
  })
})
