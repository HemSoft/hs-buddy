import { describe, expect, it } from 'vitest'
import { featureRouteLoaders } from './AppContentLazyRoutes'
import { assistantPanelLoader } from './AppLazyPanels'

describe('lazy application modules', () => {
  it.each(Object.entries(featureRouteLoaders))(
    '%s resolves its named component export',
    async (_name, loadRoute) => {
      const module = await loadRoute()

      expect(module.default).toBeDefined()
    }
  )

  it('resolves the assistant panel outside the startup graph', async () => {
    const module = await assistantPanelLoader()

    expect(module.default).toBeDefined()
  })
})
