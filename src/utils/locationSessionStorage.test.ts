import { beforeEach, expect, it } from 'vitest'
import {
  locationSessionStorage,
  readLocationSessionJson,
  writeLocationSessionJson,
} from './locationSessionStorage'

beforeEach(() => {
  locationSessionStorage.clear()
  localStorage.clear()
  sessionStorage.clear()
})

it('keeps private coordinates out of both browser storage mechanisms', () => {
  const location = { latitude: 12.3456, longitude: -65.4321 }
  writeLocationSessionJson('weather:location', location)
  expect(readLocationSessionJson('weather:location')).toEqual(location)
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  locationSessionStorage.removeItem('weather:location')
  expect(readLocationSessionJson('weather:location')).toBeNull()
})

it('discards malformed session data', () => {
  locationSessionStorage.setItem('weather:cache', '{broken')
  expect(readLocationSessionJson('weather:cache')).toBeNull()
})
