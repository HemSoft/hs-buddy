import '@testing-library/jest-dom/vitest'

// Node.js 25+ ships native localStorage / sessionStorage stubs that are plain
// objects without Storage methods.  Even when happy-dom provides a proper
// Storage class, its prototype-based methods don't work with vi.spyOn through
// the vitest/happy-dom proxy layer.  We replace both with in-memory shims
// whose methods live on the instance (not the prototype), making them
// compatible with vi.spyOn and vi.mocked.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    value: makeMemoryStorage(),
    writable: true,
    configurable: true,
  })
}
