import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { IPC_INVOKE } from '../ipc/contracts'

function hasAccountsToMigrate<T>(configAccounts: T[] | undefined): configAccounts is T[] {
  return !!configAccounts && configAccounts.length > 0
}

function shouldSkipAccountMigration(existingAccounts: { length: number } | undefined): boolean {
  return !existingAccounts || existingAccounts.length > 0
}

function logImportedAccountCount(importedLength: number) {
  if (importedLength <= 0) return
  console.log(`[Migration] Imported ${importedLength} GitHub accounts to Convex`)
}

async function migrateAccounts<T>(
  configAccounts: T[] | undefined,
  existingAccounts: { length: number } | undefined,
  bulkImport: (args: { accounts: T[] }) => Promise<{ length: number }>
): Promise<void> {
  if (!hasAccountsToMigrate(configAccounts)) return
  if (shouldSkipAccountMigration(existingAccounts)) return
  console.log('[Migration] Importing GitHub accounts from electron-store...')
  const imported = await bulkImport({ accounts: configAccounts })
  logImportedAccountCount(imported.length)
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
    if (isLoading) {
      return
    }

    // Only attempt migration once per session
    if (migrationAttempted.current) {
      setIsComplete(true)
      return
    }
    migrationAttempted.current = true

    const migrate = async () => {
      try {
        // Get data from electron-store
        const config = await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_CONFIG)

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
