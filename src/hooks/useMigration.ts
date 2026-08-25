import { useEffect, useRef, useState } from 'react'
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { isValidGitHubAccountSlug } from '../../shared/githubAccountIdentity'
import { IPC_INVOKE } from '../ipc/contracts'
import { markAccountMigrationReady } from './useAccountMigrationState'

const MAX_MIGRATION_RETRIES = 4
const MIGRATION_RETRY_BASE_DELAY_MS = 1_000

function hasAccountsToMigrate<T>(configAccounts: T[] | undefined): configAccounts is T[] {
  return !!configAccounts && configAccounts.length > 0
}

type AccountIdentity = {
  _id?: string
  username: string
  org: string
  repoRoot?: string
  usageProvider?: 'copilot' | 'codex'
  createdAt?: number
}

function getAccountIdentityKey(account: AccountIdentity): string {
  return `${account.username.toLowerCase()}\0${account.org.toLowerCase()}`
}

type AccountMigrationPlan<T> = {
  accountsToImport: T[]
  expectedSnapshot: Map<string, AccountIdentity> | null
  requiresSnapshotRefresh: boolean
}

function isMissingLocalMetadata(local: AccountIdentity, existing: AccountIdentity) {
  return (
    (local.repoRoot !== undefined && existing.repoRoot === undefined) ||
    (local.usageProvider !== undefined && existing.usageProvider === undefined)
  )
}

function createAccountMigrationPlan<T extends AccountIdentity>(
  configAccounts: T[] | undefined,
  existingAccounts: AccountIdentity[]
): AccountMigrationPlan<T> {
  if (!hasAccountsToMigrate(configAccounts)) {
    return { accountsToImport: [], expectedSnapshot: null, requiresSnapshotRefresh: false }
  }
  const validConfigAccounts = configAccounts.filter(
    account => isValidGitHubAccountSlug(account.username) && isValidGitHubAccountSlug(account.org)
  )
  const orderedExistingAccounts = [...existingAccounts].sort(
    (left, right) =>
      (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
      (left._id ?? '').localeCompare(right._id ?? '')
  )
  const existingByIdentity = new Map<string, AccountIdentity>()
  for (const account of orderedExistingAccounts) {
    const identity = getAccountIdentityKey(account)
    if (!existingByIdentity.has(identity)) existingByIdentity.set(identity, account)
  }
  const existingCodexOwner = orderedExistingAccounts.find(
    account => account.usageProvider === 'codex'
  )
  const normalizedConfigAccounts = validConfigAccounts.map(account => {
    const existing = existingByIdentity.get(getAccountIdentityKey(account))
    const conflictsWithCodexOwner =
      account.usageProvider === 'codex' &&
      existing?.usageProvider === undefined &&
      existingCodexOwner !== undefined &&
      getAccountIdentityKey(existingCodexOwner) !== getAccountIdentityKey(account)
    if (!conflictsWithCodexOwner) return account
    const metadata = { ...account }
    delete metadata.usageProvider
    return metadata
  })
  const accountsToImport = normalizedConfigAccounts.filter(account => {
    const existing = existingByIdentity.get(getAccountIdentityKey(account))
    return !existing || isMissingLocalMetadata(account, existing)
  })
  const expectedSnapshot =
    accountsToImport.length > 0
      ? new Map(
          accountsToImport.map(account => {
            const identity = getAccountIdentityKey(account)
            const existing = existingByIdentity.get(identity)
            return [
              identity,
              {
                username: existing?.username ?? account.username,
                org: existing?.org ?? account.org,
                repoRoot: existing?.repoRoot ?? account.repoRoot,
                usageProvider: existing?.usageProvider ?? account.usageProvider,
              },
            ]
          })
        )
      : null
  return {
    accountsToImport,
    expectedSnapshot,
    requiresSnapshotRefresh: accountsToImport.length > 0,
  }
}

function containsExpectedAccounts(
  accounts: AccountIdentity[],
  expectedSnapshot: Map<string, AccountIdentity>
) {
  return [...expectedSnapshot].every(([identity, expected]) =>
    accounts.some(
      account =>
        getAccountIdentityKey(account) === identity &&
        (expected.repoRoot === undefined || account.repoRoot === expected.repoRoot) &&
        (expected.usageProvider === undefined || account.usageProvider === expected.usageProvider)
    )
  )
}

type ValueRef<T> = { current: T }

function completePendingAccountSnapshot(
  accounts: AccountIdentity[],
  pendingSnapshotRef: ValueRef<Map<string, AccountIdentity> | null>
) {
  const expectedSnapshot = pendingSnapshotRef.current
  if (!expectedSnapshot || !containsExpectedAccounts(accounts, expectedSnapshot)) return
  pendingSnapshotRef.current = null
  markAccountMigrationReady()
}

function accountPlanIsReady(
  plan: AccountMigrationPlan<unknown>,
  latestAccounts: AccountIdentity[] | undefined
) {
  return (
    !plan.expectedSnapshot ||
    !plan.requiresSnapshotRefresh ||
    Boolean(latestAccounts && containsExpectedAccounts(latestAccounts, plan.expectedSnapshot))
  )
}

function resetRetryBudgetAfterReconnect(
  connectionCount: number,
  handledConnectionCountRef: ValueRef<number>,
  retryAttemptRef: ValueRef<number>,
  migrationExhaustedRef: ValueRef<boolean>
) {
  if (connectionCount <= handledConnectionCountRef.current) return
  handledConnectionCountRef.current = connectionCount
  retryAttemptRef.current = 0
  migrationExhaustedRef.current = false
}

async function migrateAccounts<T>(
  missingAccounts: T[],
  bulkImport: (args: { accounts: T[] }) => Promise<{ length: number }>
): Promise<void> {
  if (missingAccounts.length === 0) return
  console.log('[Migration] Importing GitHub accounts from electron-store…')
  const imported = await bulkImport({ accounts: missingAccounts })
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

function useMigrationCompletionState() {
  const [isComplete, setIsComplete] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isComplete) {
        console.warn('[Migration] Convex connection timeout - proceeding without migration')
        setTimedOut(true)
        setIsComplete(true)
      }
    }, 3000)
    return () => {
      clearTimeout(timeout)
    }
  }, [isComplete])

  return { isComplete, setIsComplete, timedOut }
}

type MigrationMonitor = {
  migrationPromiseRef: ValueRef<Promise<void> | null>
  retryAttemptRef: ValueRef<number>
  migrationExhaustedRef: ValueRef<boolean>
  setRetryRevision: (update: (current: number) => number) => void
  setIsComplete: (complete: boolean) => void
}

function monitorMigration(migration: Promise<void>, monitor: MigrationMonitor) {
  let cancelled = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  void migration
    .then(() => {
      monitor.retryAttemptRef.current = 0
      monitor.migrationExhaustedRef.current = false
      if (!cancelled) monitor.setIsComplete(true)
    })
    .catch((error: unknown) => {
      console.error('[Migration] Failed to migrate from electron-store:', error)
      if (monitor.migrationPromiseRef.current === migration) {
        monitor.migrationPromiseRef.current = null
      }
      if (!cancelled && monitor.retryAttemptRef.current < MAX_MIGRATION_RETRIES) {
        const retryDelay = MIGRATION_RETRY_BASE_DELAY_MS * 2 ** monitor.retryAttemptRef.current
        monitor.retryAttemptRef.current += 1
        retryTimer = setTimeout(() => {
          monitor.setRetryRevision(current => current + 1)
        }, retryDelay)
      } else if (!cancelled) {
        monitor.migrationExhaustedRef.current = true
        console.error(
          `[Migration] Giving up after ${MAX_MIGRATION_RETRIES} retries; migration remains pending`
        )
      }
    })
  return () => {
    cancelled = true
    if (retryTimer) clearTimeout(retryTimer)
  }
}

/**
 * One-time migration from electron-store to Convex
 * Runs on app startup with a timeout to prevent infinite loading
 */
export function useMigrateToConvex() {
  const bulkImportAccounts = useMutation(api.githubAccounts.bulkImport)
  const initSettings = useMutation(api.settings.initFromMigration)
  const { isComplete, setIsComplete, timedOut } = useMigrationCompletionState()
  const [retryRevision, setRetryRevision] = useState(0)
  const connection = useConvexConnectionState()
  const migrationPromiseRef = useRef<Promise<void> | null>(null)
  const retryAttemptRef = useRef(0)
  const migrationExhaustedRef = useRef(false)
  const handledConnectionCountRef = useRef(connection.connectionCount)
  const pendingAccountSnapshotRef = useRef<Map<string, AccountIdentity> | null>(null)

  // Check if Convex already has data (skip migration if so)
  const existingAccounts = useQuery(api.githubAccounts.list)
  const existingSettings = useQuery(api.settings.get)
  const existingAccountsRef = useRef(existingAccounts)
  existingAccountsRef.current = existingAccounts

  // Loading until Convex queries resolve OR timeout
  const isLoading = (existingAccounts === undefined || existingSettings === undefined) && !timedOut

  useEffect(() => {
    // Wait for Convex queries to load first
    if (existingAccounts === undefined || existingSettings === undefined) {
      return
    }
    if (!connection.isWebSocketConnected) return

    completePendingAccountSnapshot(existingAccounts, pendingAccountSnapshotRef)
    resetRetryBudgetAfterReconnect(
      connection.connectionCount,
      handledConnectionCountRef,
      retryAttemptRef,
      migrationExhaustedRef
    )

    if (migrationExhaustedRef.current) {
      return
    }

    if (!migrationPromiseRef.current) {
      migrationPromiseRef.current = (async () => {
        const config = await window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_CONFIG)
        const accountPlan = createAccountMigrationPlan(config.github?.accounts, existingAccounts)
        pendingAccountSnapshotRef.current = accountPlan.expectedSnapshot
        await migrateAccounts(accountPlan.accountsToImport, bulkImportAccounts)
        if (accountPlanIsReady(accountPlan, existingAccountsRef.current)) {
          pendingAccountSnapshotRef.current = null
          markAccountMigrationReady()
        }
        await migrateSettings(config.pr, existingSettings, initSettings)
      })()
    }

    return monitorMigration(migrationPromiseRef.current, {
      migrationPromiseRef,
      retryAttemptRef,
      migrationExhaustedRef,
      setRetryRevision,
      setIsComplete,
    })
  }, [
    existingAccounts,
    existingSettings,
    bulkImportAccounts,
    initSettings,
    retryRevision,
    connection.connectionCount,
    connection.isWebSocketConnected,
    setIsComplete,
  ])

  return { isComplete, isLoading }
}
