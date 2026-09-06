import { safeStorage } from 'electron'
import type { AppConfig } from '../../src/types/config'

type WeatherLocation = AppConfig['ui']['weatherLocation']

interface CipherStore {
  read(): string
  write(ciphertext: string): void
}

function isCoordinate(value: unknown, limit: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

function isLocation(value: unknown): value is NonNullable<WeatherLocation> {
  if (!value || typeof value !== 'object') return false
  const location = value as Record<string, unknown>
  return (
    isCoordinate(location.latitude, 90) &&
    isCoordinate(location.longitude, 180) &&
    typeof location.name === 'string'
  )
}

function canProtectLocation(): boolean {
  return (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  )
}

/** The only durable representation is OS-encrypted ciphertext. */
export class ProtectedWeatherLocation {
  private location: WeatherLocation = null
  private loaded = false
  private dirty = false

  constructor(
    private readonly store: CipherStore,
    legacy: unknown
  ) {
    if (isLocation(legacy)) {
      this.location = legacy
      this.loaded = true
      this.dirty = true
    }
  }

  persistPending(): void {
    if (!this.dirty || !canProtectLocation()) return
    try {
      const ciphertext = safeStorage.encryptString(JSON.stringify(this.location))
      this.store.write(ciphertext.toString('base64'))
      this.dirty = false
    } catch (_: unknown) {
      // Retain the current session value and retry when secure storage recovers.
    }
  }

  get(): WeatherLocation {
    this.persistPending()
    if (this.loaded || !canProtectLocation()) return this.location
    try {
      const ciphertext = this.store.read()
      if (!ciphertext) return null
      const value: unknown = JSON.parse(
        safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
      )
      if (!isLocation(value)) return null
      this.location = value
      this.loaded = true
    } catch (_: unknown) {
      // Corrupt or unavailable ciphertext never becomes a plaintext fallback.
    }
    return this.location
  }

  set(value: WeatherLocation): void {
    if (value !== null && !isLocation(value)) throw new Error('Invalid weather location')
    // Clear the previous remembered location even if encryption is unavailable.
    this.store.write('')
    this.location = value
    this.loaded = true
    this.dirty = value !== null
    this.persistPending()
  }
}
