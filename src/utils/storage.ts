/**
 * Thin wrappers around localStorage that silence exceptions.
 *
 * localStorage can throw (e.g. when storage is full, disabled, or in a
 * sandboxed iframe). Every call site was wrapping access in identical
 * try/catch blocks — this module centralizes that guard.
 *
 * Domain validation (schema checks, versioning, TTL) stays at call sites.
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
    /* v8 ignore start */
  } catch (_: unknown) {
    return null
  }
  /* v8 ignore stop */
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (_: unknown) {
    // localStorage unavailable or full
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (_: unknown) {
    // localStorage unavailable
  }
}

export function safeGetJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch (_: unknown) {
    return null
  }
}

export function safeSetJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (_: unknown) {
    // localStorage unavailable or full
  }
}
