import type { GitHubAccount } from '../types/config'
import { getUsageProviderOverrideKey } from '../utils/usageProviderOverrides'
import {
  cancelUsageProviderRetry,
  scheduleUsageProviderRetry,
  type CanAttemptReconciliation,
} from './useUsageProviderRetry'

type OverrideResult = { success: boolean; error?: string }
type SelectionSerializationOptions = {
  waitForReconciliation?: boolean
  recoverAfterStaleReconciliation?: () => Promise<OverrideResult>
}
type SelectionTurn = {
  previousSelection?: Promise<void>
  previousLocalSelection?: Promise<void>
  staleReconciliation?: Promise<void>
  queuedSelections: Promise<void>
  queuedLocalSelections: Promise<void> | null
  release: () => void
}

const reconciliations = new Map<string, Promise<void>>()
const selectionQueues = new Map<string, Promise<void>>()
const localSelectionQueues = new Map<string, Promise<void>>()
const selectionRevisions = new Map<string, number>()
const staleReconciliationRecoveries = new Map<
  string,
  { revision: number; recover: () => Promise<OverrideResult> }
>()

async function settleOverrideResult(operation: () => Promise<OverrideResult>) {
  try {
    return await operation()
  } catch (_: unknown) {
    return { success: false }
  }
}

async function waitForReconciliation(key: string) {
  const reconciliation = reconciliations.get(key)
  if (reconciliation) await reconciliation
}

function beginSelection(key: string, localOnly: boolean) {
  const revision = (selectionRevisions.get(key) ?? 0) + 1
  selectionRevisions.set(key, revision)
  if (!localOnly) staleReconciliationRecoveries.delete(key)
  return revision
}

async function recoverStaleReconciliation(key: string, revision: number) {
  if (selectionRevisions.get(key) !== revision) return
  const recovery = staleReconciliationRecoveries.get(key)
  if (!recovery || recovery.revision !== revision) return
  const result = await settleOverrideResult(recovery.recover)
  if (
    selectionRevisions.get(key) !== revision ||
    staleReconciliationRecoveries.get(key) !== recovery
  ) {
    return
  }
  if (result.success) staleReconciliationRecoveries.delete(key)
  else scheduleUsageProviderRetry(key)
}

export function trackUsageProviderReconciliation(key: string, operation: Promise<void>) {
  reconciliations.set(key, operation)
  void operation.finally(() => {
    if (reconciliations.get(key) === operation) reconciliations.delete(key)
  })
}

function scheduleStaleReconciliationRecovery(
  key: string,
  revision: number,
  result: OverrideResult,
  recover: (() => Promise<OverrideResult>) | undefined,
  staleReconciliation: Promise<void> | undefined
) {
  if (
    !result.success ||
    !recover ||
    !staleReconciliation ||
    selectionRevisions.get(key) !== revision
  ) {
    return
  }
  staleReconciliationRecoveries.set(key, { revision, recover })
  void staleReconciliation.then(() => {
    const operation = recoverStaleReconciliation(key, revision)
    trackUsageProviderReconciliation(key, operation)
  })
}

function enqueueSelection(key: string, localOnly: boolean): SelectionTurn {
  const previousSelection = selectionQueues.get(key)
  const previousLocalSelection = localSelectionQueues.get(key)
  const staleReconciliation = reconciliations.get(key)
  let release!: () => void
  const complete = new Promise<void>(resolve => {
    release = resolve
  })
  const queuedSelections = Promise.all([previousSelection, complete]).then(() => {})
  selectionQueues.set(key, queuedSelections)
  const queuedLocalSelections = localOnly
    ? (previousLocalSelection ?? Promise.resolve()).then(() => complete)
    : null
  if (queuedLocalSelections) localSelectionQueues.set(key, queuedLocalSelections)
  return {
    previousSelection,
    previousLocalSelection,
    staleReconciliation,
    queuedSelections,
    queuedLocalSelections,
    release,
  }
}

async function waitForSelectionTurn(key: string, turn: SelectionTurn, localOnly: boolean) {
  await (localOnly ? turn.previousLocalSelection : turn.previousSelection)
  if (!localOnly) await waitForReconciliation(key)
}

function completeSelectionTurn(key: string, turn: SelectionTurn) {
  turn.release()
  void turn.queuedSelections.then(() => {
    if (selectionQueues.get(key) === turn.queuedSelections) selectionQueues.delete(key)
  })
  if (turn.queuedLocalSelections) {
    void turn.queuedLocalSelections.then(() => {
      if (localSelectionQueues.get(key) === turn.queuedLocalSelections) {
        localSelectionQueues.delete(key)
      }
    })
  }
}

export async function serializeUsageProviderSelection(
  account: Pick<GitHubAccount, 'username' | 'org'>,
  operation: (isCurrent: () => boolean) => Promise<OverrideResult>,
  options: SelectionSerializationOptions = {}
): Promise<OverrideResult> {
  const key = getUsageProviderOverrideKey(account)
  const localOnly = options.waitForReconciliation === false
  const revision = beginSelection(key, localOnly)
  const turn = enqueueSelection(key, localOnly)
  try {
    await waitForSelectionTurn(key, turn, localOnly)
    cancelUsageProviderRetry(key)
    const result = await operation(() => selectionRevisions.get(key) === revision)
    scheduleStaleReconciliationRecovery(
      key,
      revision,
      result,
      options.recoverAfterStaleReconciliation,
      turn.staleReconciliation
    )
    return result
  } finally {
    completeSelectionTurn(key, turn)
  }
}

export function hasPendingUsageProviderWork(key: string) {
  return reconciliations.has(key) || selectionQueues.has(key)
}

export function startPendingUsageProviderRecovery(
  key: string,
  canAttempt: CanAttemptReconciliation
) {
  const recovery = staleReconciliationRecoveries.get(key)
  if (
    !recovery ||
    recovery.revision !== selectionRevisions.get(key) ||
    hasPendingUsageProviderWork(key) ||
    !canAttempt(key)
  ) {
    return false
  }
  const operation = recoverStaleReconciliation(key, recovery.revision)
  trackUsageProviderReconciliation(key, operation)
  return true
}
