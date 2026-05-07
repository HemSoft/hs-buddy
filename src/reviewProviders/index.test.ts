import { describe, expect, it } from 'vitest'
import {
  copilotProvider,
  codeRabbitProvider,
  clearCodeRabbitDetectionCache,
  allProviders,
  detectAvailableProviders,
  getProviderById,
  clearAvailabilityCache,
} from './index'
import { copilotProvider as copilotDirect } from './copilotProvider'
import {
  codeRabbitProvider as codeRabbitDirect,
  clearCodeRabbitDetectionCache as clearCRCacheDirect,
} from './codeRabbitProvider'
import {
  allProviders as registryAll,
  detectAvailableProviders as registryDetect,
  getProviderById as registryGetById,
  clearAvailabilityCache as registryClearCache,
} from './registry'

describe('reviewProviders barrel', () => {
  it('re-exports provider instances with correct identity', () => {
    expect(copilotProvider).toBe(copilotDirect)
    expect(codeRabbitProvider).toBe(codeRabbitDirect)
  })

  it('re-exports registry utilities with correct identity', () => {
    expect(allProviders).toBe(registryAll)
    expect(detectAvailableProviders).toBe(registryDetect)
    expect(getProviderById).toBe(registryGetById)
    expect(clearAvailabilityCache).toBe(registryClearCache)
    expect(clearCodeRabbitDetectionCache).toBe(clearCRCacheDirect)
  })

  it('allProviders contains the expected provider instances', () => {
    expect(allProviders).toContain(copilotProvider)
    expect(allProviders).toContain(codeRabbitProvider)
    expect(allProviders).toHaveLength(2)
  })

  it('getProviderById round-trips known providers', () => {
    expect(getProviderById('copilot')).toBe(copilotProvider)
    expect(getProviderById('coderabbit')).toBe(codeRabbitProvider)
    expect(getProviderById('nonexistent')).toBeUndefined()
  })
})
