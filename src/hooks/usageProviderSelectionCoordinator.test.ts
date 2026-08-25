import { describe, expect, it } from 'vitest'
import {
  serializeUsageProviderMaintenance,
  serializeUsageProviderSelection,
} from './usageProviderSelectionCoordinator'

describe('usageProviderSelectionCoordinator', () => {
  it('waits for a connected selection before running maintenance', async () => {
    const account = { username: 'queued-owner', org: 'test-org' }
    let startSelection!: () => void
    let finishSelection!: () => void
    let maintenanceStarted = false
    const selectionStarted = new Promise<void>(resolve => {
      startSelection = resolve
    })
    const selection = serializeUsageProviderSelection(account, async () => {
      startSelection()
      return new Promise(resolve => {
        finishSelection = () => resolve({ success: true })
      })
    })
    await selectionStarted

    const maintenance = serializeUsageProviderMaintenance(account, async () => {
      maintenanceStarted = true
      return { success: true }
    })
    await Promise.resolve()
    expect(maintenanceStarted).toBe(false)

    finishSelection()
    await expect(Promise.all([selection, maintenance])).resolves.toEqual([
      { success: true },
      { success: true },
    ])
    expect(maintenanceStarted).toBe(true)
  })
})
