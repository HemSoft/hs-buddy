// Location and derived forecasts live only in this renderer's memory. This is
// deliberately independent of localStorage and the disk-backed sessionStorage.
const values = new Map<string, string>()

export const locationSessionStorage = {
  getItem(key: string): string | null {
    return values.get(key) ?? null
  },
  setItem(key: string, value: string): void {
    values.set(key, value)
  },
  removeItem(key: string): void {
    values.delete(key)
  },
  clear(): void {
    values.clear()
  },
}

export function readLocationSessionJson<T>(key: string): T | null {
  const value = locationSessionStorage.getItem(key)
  if (value === null) return null
  try {
    return JSON.parse(value) as T
  } catch (_: unknown) {
    return null
  }
}

export function writeLocationSessionJson(key: string, value: unknown): void {
  locationSessionStorage.setItem(key, JSON.stringify(value))
}
