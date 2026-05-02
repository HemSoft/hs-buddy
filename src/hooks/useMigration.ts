import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

async function migrateAccounts<T>(
  configAccounts: T[] | undefined,
  existingAccounts: { length: number } | undefined,
  bulkImport: (args: { accounts: T[] }) => Promise<{ length: number }>
): Promise<void> {
  if (!configAccounts || configAccounts.length === 0) return
  if (!existingAccounts || existingAccounts.length > 0) return
  console.log('[Migration] Importing GitHub accounts from electron-store...')
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
  console.log('[Migration] Importing PR settings from electron-store...')
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
  const migrationAttempted = useRef(false)

  // Check if Convex already has data (skip migration if so)
  const existingAccounts = useQuery(api.githubAccounts.list)
  const existingSettings = useQuery(api.settings.get)

  // Loading until Convex queries resolve OR timeout
  const isLoading = (existingAccounts === undefined || existingSettings === undefined) && !timedOut

  // Timeout after 3 seconds to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      /* v8 ignore start */
      if (!isComplete) {
        /* v8 ignore stop */
        console.warn('[Migration] Convex connection timeout - proceeding without migration')
        setTimedOut(true)
        setIsComplete(true)
      }
    }, 3000)
    return () => clearTimeout(timeout)
  }, [isComplete])

  useEffect(() => {
    // Wait for Convex queries to load first
    if (isLoading) {
      return
    }

    // Only attempt migration once per session
    /* v8 ignore start */
    if (migrationAttempted.current) {
      setIsComplete(true)
      return
      /* v8 ignore stop */
    }
    migrationAttempted.current = true

    const migrate = async () => {
      try {
        // Get data from electron-store
        const config = await window.ipcRenderer.invoke('config:get-config')

        await migrateAccounts(config.github?.accounts, existingAccounts, bulkImportAccounts)
        await migrateSettings(config.pr, existingSettings, initSettings)
      } catch (error: unknown) {
        console.error('[Migration] Failed to migrate from electron-store:', error)
      } finally {
        setIsComplete(true)
      }
    }

    migrate()
  }, [isLoading, existingAccounts, existingSettings, bulkImportAccounts, initSettings])

  return { isComplete, isLoading }
}
