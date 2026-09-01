import { describe, expect, it, vi } from 'vitest'
import { featureRouteLoaders } from './AppContentLazyRoutes'

describe('lazy application modules', () => {
  it.each(Object.entries(featureRouteLoaders))(
    '%s resolves its named component export',
    async (_name, loadRoute) => {
      const module = await loadRoute()

      expect(module.default).toBeDefined()
    }
  )

  it('does not load the assistant panel until its loader runs', async () => {
    let assistantModuleLoads = 0
    vi.resetModules()
    vi.doMock('./AssistantPanel', () => {
      assistantModuleLoads += 1
      return { AssistantPanel: () => null }
    })

    try {
      const { assistantPanelLoader } = await import('./AppLazyPanels')
      expect(assistantModuleLoads).toBe(0)

      const module = await assistantPanelLoader()
      expect(assistantModuleLoads).toBe(1)
      expect(module.default).toBeDefined()
    } finally {
      vi.doUnmock('./AssistantPanel')
      vi.resetModules()
    }
  })
})
