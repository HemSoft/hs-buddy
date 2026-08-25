import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { IPC_INVOKE } from '../ipc/contracts'
import { markAccountMigrationReady } from './useAccountMigrationState'

const MAX_MIGRATION_RETRIES = 4
const MIGRATION_RETRY_BASE_DELAY_MS = 1_000

function hasAccountsToMigrate<T>(configAccounts: T[] | undefined): configAccounts is T[] {
  return !!configAccounts && configAccounts.length > 0
}

function shouldSkipAccountMigration(existingAccounts: { length: number } | undefined): boolean {
  return !existingAccounts || existingAccounts.length > 0
}

async function migrateAccounts<T>(
  configAccounts: T[] | undefined,
  existingAccounts: { length: number } | undefined,
  bulkImport: (args: { accounts: T[] }) => Promise<{ length: number }>
): Promise<void> {
  if (!hasAccountsToMigrate(configAccounts)) return
  if (shouldSkipAccountMigration(existingAccounts)) return
  console.log('[Migration] Importing GitHub accounts from electron-store…')
  const imported = await bulkImport({ accounts: configAccounts })
  if (imported.length > 0) {
    console.log(`[Migration] Imported ${imported.length} GitHub accounts to Convex`)
  }
}

async function migrateSettings<T>(
  configPR: T | undefined,
  existingSettings: object | null | undefined,
  initSettings: (args: { pr: T }) => Promise<unknown>
): Promise<void> {
  const settingsExistInConvex = existingSettings && '_id' in existingSettings
  if (!configPR || settingsExistInConvex) return
  console.log('[Migration] Importing PR settings from electron-store…')
  await initSettings({ pr: configPR })
  console.log('[Migration] PR settings migrated to Convex')
}

/**
 * One-time migration from electron-store to Convex
 * Runs on app startup with a timeout to prevent infinite loading
 */
export function useMigrateToConvex() {
  const bulkImportAccounts = useMutation(api.githubAccounts.bulkImport)
  const initSettings = useMutation(api.settings.initFromMigration)
  const [isComplete, setIsComplete] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [retryRevision, setRetryRevision] = useState(0)
  const migrationPromiseRef = useRef<Promise<void> | null>(null)
  const retryAttemptRef = useRef(0)
  const migrationExhaustedRef = useRef(false)

  // Check if Convex already has data (skip migration if so)
  const existingAccounts = useQuery(api.githubAccounts.list)
  const existingSettings = useQuery(api.settings.get)

  // Loading until Convex queries resolve OR timeout
  const isLoading = (existingAccounts === undefined || existingSettings === undefined) && !timedOut

  // Timeout after 3 seconds to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isComplete) {
        console.warn('[Migration] Convex connection timeout - proceeding without migration')
        setTimedOut(true)
        setIsComplete(true)
      }
    }, 3000)
    return () => clearTimeout(timeout)
  }, [isComplete])

  useEffect(() => {
    // Wait for Convex queries to load first
    if (existingAccounts === undefined || existingSettings === undefined) {
      return
    }

    if (migrationExhaustedRef.current) {
      if (existingAccounts.length > 0) markAccountMigrationReady()
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    if (!migrationPromiseRef.current) {
      migrationPromiseRef.current = (async () => {
        const config = await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
        await migrateAccounts(config.github?.accounts, existingAccounts, bulkImportAccounts)
        await migrateSettings(config.pr, existingSettings, initSettings)
      })()
    }

    const migration = migrationPromiseRef.current
    void migration
      .then(() => {
        retryAttemptRef.current = 0
        migrationExhaustedRef.current = false
        markAccountMigrationReady()
        if (!cancelled) setIsComplete(true)
      })
      .catch((error: unknown) => {
        console.error('[Migration] Failed to migrate from electron-store:', error)
        if (migrationPromiseRef.current === migration) migrationPromiseRef.current = null
        if (!cancelled && retryAttemptRef.current < MAX_MIGRATION_RETRIES) {
          const retryDelay = MIGRATION_RETRY_BASE_DELAY_MS * 2 ** retryAttemptRef.current
          retryAttemptRef.current += 1
          retryTimer = setTimeout(() => {
            setRetryRevision(current => current + 1)
          }, retryDelay)
        } else if (!cancelled) {
          migrationExhaustedRef.current = true
          console.error(
            `[Migration] Giving up after ${MAX_MIGRATION_RETRIES} retries; migration remains pending`
          )
        }
      })

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [existingAccounts, existingSettings, bulkImportAccounts, initSettings, retryRevision])

  return { isComplete, isLoading }
}
