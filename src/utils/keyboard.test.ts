import { describe, it, expect, vi } from 'vitest'
import { onKeyboardActivate } from './keyboard'

function createKeyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent
}

describe('onKeyboardActivate', () => {
  it('calls action on Enter', () => {
    const action = vi.fn()
    const handler = onKeyboardActivate(action)
    const event = createKeyEvent('Enter')

    handler(event)

    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('calls action on Space', () => {
    const action = vi.fn()
    const handler = onKeyboardActivate(action)
    const event = createKeyEvent(' ')

    handler(event)

    expect(action).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it('does nothing on other keys', () => {
    const action = vi.fn()
    const handler = onKeyboardActivate(action)
    const event = createKeyEvent('Tab')

    handler(event)

    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does nothing on Escape', () => {
    const action = vi.fn()
    const handler = onKeyboardActivate(action)
    const event = createKeyEvent('Escape')

    handler(event)

    expect(action).not.toHaveBeenCalled()
  })
})
