import { useSyncExternalStore } from 'react'

let accountMigrationReady = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publishAccountMigrationState(ready: boolean) {
  if (accountMigrationReady === ready) return
  accountMigrationReady = ready
  for (const listener of listeners) listener()
}

export function markAccountMigrationPending() {
  publishAccountMigrationState(false)
}

export function markAccountMigrationReady() {
  publishAccountMigrationState(true)
}

export function useAccountMigrationReady() {
  return useSyncExternalStore(subscribe, () => accountMigrationReady)
}
