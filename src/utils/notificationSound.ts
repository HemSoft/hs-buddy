const NOTIFICATION_SOUND_MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

export const MAX_NOTIFICATION_SOUND_BYTES = 5 * 1024 * 1024

export interface NotificationSoundAsset {
  base64: string
  mimeType: string
}

export function createNotificationSoundBlob(sound: NotificationSoundAsset): Blob {
  const binary = atob(sound.base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: sound.mimeType })
}

function getNotificationSoundExtension(filePath: string): string | null {
  const extensionIndex = filePath.lastIndexOf('.')
  if (extensionIndex < 0) return null

  return filePath.slice(extensionIndex).toLowerCase()
}

export function isSupportedNotificationSoundPath(filePath: string): boolean {
  if (typeof filePath !== 'string') return false

  const normalizedFilePath = filePath.trim()
  if (!normalizedFilePath) return false

  const extension = getNotificationSoundExtension(normalizedFilePath)
  return extension !== null && extension in NOTIFICATION_SOUND_MIME_TYPES
}

export function getNotificationSoundMimeType(filePath: string): string {
  const extension = getNotificationSoundExtension(filePath)
  if (!extension) return 'application/octet-stream'

  return NOTIFICATION_SOUND_MIME_TYPES[extension] ?? 'application/octet-stream'
}
