import { beforeEach, expect, it, vi } from 'vitest'
import { safeStorage } from 'electron'
import { ProtectedWeatherLocation } from './protectedWeatherLocation'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}))

const location = { latitude: 12.3456, longitude: -65.4321, name: 'Private place' }
const encrypted = Buffer.from('opaque-os-ciphertext')

function createStore(ciphertext = '') {
  return {
    read: vi.fn(() => ciphertext),
    write: vi.fn((next: string) => {
      ciphertext = next
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('gnome_libsecret')
  vi.mocked(safeStorage.encryptString).mockReturnValue(encrypted)
  vi.mocked(safeStorage.decryptString).mockReturnValue(JSON.stringify(location))
})

it('persists only ciphertext and decrypts it in a new session', () => {
  const store = createStore()
  const first = new ProtectedWeatherLocation(store, null)
  first.set(location)
  expect(store.write.mock.calls).toEqual([[''], [encrypted.toString('base64')]])
  expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(location))
  const second = new ProtectedWeatherLocation(store, null)
  expect(second.get()).toEqual(location)
  expect(safeStorage.decryptString).toHaveBeenCalledWith(encrypted)
  expect(second.get()).toEqual(location)
  expect(safeStorage.decryptString).toHaveBeenCalledTimes(1)
})

it('migrates legacy coordinates when encryption becomes available', () => {
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
  const store = createStore()
  const saved = new ProtectedWeatherLocation(store, location)
  expect(saved.get()).toEqual(location)
  expect(store.write).not.toHaveBeenCalled()
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  expect(saved.get()).toEqual(location)
  expect(store.write).toHaveBeenCalledWith(encrypted.toString('base64'))
})

it('keeps a changed location in memory and clears old ciphertext when unavailable', () => {
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
  const store = createStore('old-cipher')
  const saved = new ProtectedWeatherLocation(store, null)
  saved.set(location)
  expect(saved.get()).toEqual(location)
  expect(store.write.mock.calls).toEqual([['']])
  expect(new ProtectedWeatherLocation(store, null).get()).toBeNull()
  expect(safeStorage.encryptString).not.toHaveBeenCalled()
})

it('rejects the Linux basic_text fallback even if encryption reports available', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'linux' })
  try {
    vi.mocked(safeStorage.getSelectedStorageBackend).mockReturnValue('basic_text')
    const store = createStore()
    const saved = new ProtectedWeatherLocation(store, null)
    saved.set(location)
    expect(saved.get()).toEqual(location)
    expect(store.write.mock.calls).toEqual([['']])
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
  } finally {
    Object.defineProperty(process, 'platform', platform)
  }
})

it('retries an encryption failure without persisting plaintext', () => {
  vi.mocked(safeStorage.encryptString).mockImplementationOnce(() => {
    throw new Error('locked')
  })
  const store = createStore()
  const saved = new ProtectedWeatherLocation(store, null)
  saved.set(location)
  expect(store.write.mock.calls).toEqual([['']])
  expect(saved.get()).toEqual(location)
  expect(store.write).toHaveBeenLastCalledWith(encrypted.toString('base64'))
})

it('does not replace the current location when the durable clear fails', () => {
  const store = createStore()
  const saved = new ProtectedWeatherLocation(store, location)
  store.write.mockImplementation(() => {
    throw new Error('read-only')
  })
  expect(() => saved.set(null)).toThrow('read-only')
  expect(saved.get()).toEqual(location)
})

it('clears the remembered and session location without encrypting null', () => {
  const store = createStore('cipher')
  const saved = new ProtectedWeatherLocation(store, location)
  saved.set(null)
  expect(saved.get()).toBeNull()
  expect(store.read()).toBe('')
  expect(safeStorage.encryptString).not.toHaveBeenCalled()
})

it('returns null for empty or undecryptable ciphertext', () => {
  expect(new ProtectedWeatherLocation(createStore(), null).get()).toBeNull()
  vi.mocked(safeStorage.decryptString).mockImplementation(() => {
    throw new Error('wrong user')
  })
  expect(new ProtectedWeatherLocation(createStore('cipher'), null).get()).toBeNull()
})

it.each([
  null,
  {},
  { ...location, latitude: NaN },
  { ...location, latitude: 91 },
  { ...location, longitude: Infinity },
  { ...location, longitude: -181 },
  { ...location, latitude: '12' },
  { ...location, longitude: '65' },
  { ...location, name: 7 },
])('rejects invalid decrypted and legacy coordinates: %j', value => {
  vi.mocked(safeStorage.decryptString).mockReturnValue(JSON.stringify(value))
  const saved = new ProtectedWeatherLocation(createStore('cipher'), value)
  expect(saved.get()).toBeNull()
  if (value !== null)
    expect(() => saved.set(value as typeof location)).toThrow('Invalid weather location')
})
