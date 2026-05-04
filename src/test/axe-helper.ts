/**
 * Accessibility test helper using axe-core via vitest-axe.
 *
 * The `toHaveNoViolations` matcher is registered globally in setup.ts.
 *
 * Usage in any component test:
 *
 *   import { axe } from '../test/axe-helper'
 *
 *   it('has no accessibility violations', async () => {
 *     const { container } = render(<MyComponent />)
 *     const results = await axe(container)
 *     expect(results).toHaveNoViolations()
 *   })
 */

// Re-export the axe runner
export { axe } from 'vitest-axe'

// Augment vitest's Assertion to include toHaveNoViolations (vitest v4+ module augmentation)
declare module 'vitest' {
  interface Assertion<T> {
    toHaveNoViolations(): T
  }
}
