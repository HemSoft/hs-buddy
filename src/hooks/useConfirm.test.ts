import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConfirm } from './useConfirm'

describe('useConfirm', () => {
  it('starts with no dialog', () => {
    const { result } = renderHook(() => useConfirm())
    expect(result.current.confirmDialog).toBeNull()
  })

  it('shows dialog when confirm is called', async () => {
    const { result } = renderHook(() => useConfirm())

    act(() => {
      result.current.confirm({ message: 'Delete this?' })
    })

    expect(result.current.confirmDialog).not.toBeNull()
    expect(result.current.confirmDialog!.message).toBe('Delete this?')
  })

  it('resolves true when confirmed', async () => {
    const { result } = renderHook(() => useConfirm())

    let promise: Promise<boolean>
    act(() => {
      promise = result.current.confirm({ message: 'Are you sure?' })
    })

    expect(result.current.confirmDialog).not.toBeNull()

    await act(async () => {
      result.current.confirmDialog!.onConfirm()
    })

    expect(await promise!).toBe(true)
    expect(result.current.confirmDialog).toBeNull()
  })

  it('resolves false when cancelled', async () => {
    const { result } = renderHook(() => useConfirm())

    let promise: Promise<boolean>
    act(() => {
      promise = result.current.confirm({ message: 'Are you sure?' })
    })

    await act(async () => {
      result.current.confirmDialog!.onCancel()
    })

    expect(await promise!).toBe(false)
    expect(result.current.confirmDialog).toBeNull()
  })

  it('passes through optional properties', () => {
    const { result } = renderHook(() => useConfirm())

    act(() => {
      result.current.confirm({
        message: 'Delete all?',
        description: 'This cannot be undone',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        variant: 'danger',
      })
    })

    const dialog = result.current.confirmDialog!
    expect(dialog.description).toBe('This cannot be undone')
    expect(dialog.confirmLabel).toBe('Delete')
    expect(dialog.cancelLabel).toBe('Keep')
    expect(dialog.variant).toBe('danger')
  })
})
