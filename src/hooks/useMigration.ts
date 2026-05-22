import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { IPC_INVOKE } from '../ipc/contracts'
import type { AppConfig } from '../types/config'

function shouldSkipAccountMigration<T>(
  configAccounts: T[] | undefined,
  existingAccounts: { length: number } | undefined
): boolean {
  return !configAccounts || configAccounts.length === 0 || !existingAccounts || existingAccounts.length > 0
}

async function migrateAccounts<T>(
  configAccounts: T[] | undefined,
  existingAccounts: { length: number } | undefined,
  bulkImport: (args: { accounts: T[] }) => Promise<{ length: number }>
): Promise<void> {
  if (shouldSkipAccountMigration(configAccounts, existingAccounts)) return
  const accounts = configAccounts ?? []
  console.log('[Migration] Importing GitHub accounts from electron-store...')
  const imported = await bulkImport({ accounts })
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

function resolveMigrationTimeout(
  isComplete: boolean,
  setTimedOut: (value: boolean) => void,
  setIsComplete: (value: boolean) => void
): void {
  if (isComplete) return
  console.warn('[Migration] Convex connection timeout - proceeding without migration')
  setTimedOut(true)
  setIsComplete(true)
}

function shouldSkipMigrationAttempt(isLoading: boolean): boolean {
  return isLoading
}

function shouldCompleteMigrationAttempt(alreadyAttempted: boolean): boolean {
  return alreadyAttempted
}

interface MigrationAttemptOptions<Account, PRSettings> {
  isLoading: boolean
  migrationAttempted: { current: boolean }
  setIsComplete: (value: boolean) => void
  existingAccounts: { length: number } | undefined
  existingSettings: object | null | undefined
  bulkImportAccounts: (args: { accounts: Account[] }) => Promise<{ length: number }>
  initSettings: (args: { pr: PRSettings }) => Promise<unknown>
}

async function runMigrationAttempt<Account, PRSettings>({
  isLoading,
  migrationAttempted,
  setIsComplete,
  existingAccounts,
  existingSettings,
  bulkImportAccounts,
  initSettings,
}: MigrationAttemptOptions<Account, PRSettings>): Promise<void> {
  if (shouldSkipMigrationAttempt(isLoading)) {
    return
  }

  if (shouldCompleteMigrationAttempt(migrationAttempted.current)) {
    setIsComplete(true)
    return
  }

  migrationAttempted.current = true

  try {
    const config = (await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_CONFIG)) as AppConfig

    await migrateAccounts(
      config.github?.accounts as Account[] | undefined,
      existingAccounts,
      bulkImportAccounts
    )
    await migrateSettings(config.pr as PRSettings | undefined, existingSettings, initSettings)
  } catch (error: unknown) {
    console.error('[Migration] Failed to migrate from electron-store:', error)
  } finally {
    setIsComplete(true)
  }
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
      resolveMigrationTimeout(isComplete, setTimedOut, setIsComplete)
    }, 3000)
    return () => clearTimeout(timeout)
  }, [isComplete])

  useEffect(() => {
    void runMigrationAttempt({
      isLoading,
      migrationAttempted,
      setIsComplete,
      existingAccounts,
      existingSettings,
      bulkImportAccounts,
      initSettings,
    })
  }, [isLoading, existingAccounts, existingSettings, bulkImportAccounts, initSettings])

  return { isComplete, isLoading }
}
