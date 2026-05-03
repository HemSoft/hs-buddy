import { describe, it, expect, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcHandler } from './ipcHandler'

describe('ipcHandler', () => {
  const mockEvent = {} as IpcMainInvokeEvent

  it('returns the result of the wrapped function on success', async () => {
    const handler = ipcHandler(async (_event, name: string) => ({ greeting: `Hello ${name}` }))
    const result = await handler(mockEvent, 'World')
    expect(result).toEqual({ greeting: 'Hello World' })
  })

  it('returns { success: false, error } when the wrapped function throws', async () => {
    const handler = ipcHandler(async () => {
      throw new Error('Something went wrong')
    })
    const result = await handler(mockEvent)
    expect(result).toEqual({ success: false, error: 'Something went wrong' })
  })

  it('handles non-Error throws gracefully', async () => {
    const handler = ipcHandler(async () => {
      throw 'string error'
    })
    const result = await handler(mockEvent)
    expect(result).toEqual({ success: false, error: 'string error' })
  })

  it('passes all arguments to the wrapped function', async () => {
    const fn = vi.fn(async (_event: IpcMainInvokeEvent, a: number, b: number) => a + b)
    const handler = ipcHandler(fn)
    await handler(mockEvent, 3, 7)
    expect(fn).toHaveBeenCalledWith(mockEvent, 3, 7)
  })

  it('passes the event to the wrapped function', async () => {
    const fn = vi.fn(async (event: IpcMainInvokeEvent) => event)
    const handler = ipcHandler(fn)
    const result = await handler(mockEvent)
    expect(result).toBe(mockEvent)
  })
})
