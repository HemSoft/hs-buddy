import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAssistantConversation } from './useAssistantConversation'
import type { AssistantContext } from '../types/assistant'

vi.mock('./useAssistantContext', () => ({
  serializeContext: () => 'serialized-context',
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'ipcRenderer', {
    value: {
      invoke: vi.fn().mockResolvedValue('AI response here'),
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
})

const context: AssistantContext = {
  viewType: 'test-view',
  viewId: null,
  summary: 'Test context summary',
  metadata: {},
}

describe('useAssistantConversation', () => {
  it('starts with empty messages', () => {
    const { result } = renderHook(() => useAssistantConversation(context))
    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
  })

  it('sends a message and gets a response', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[0].content).toBe('Hello')
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].content).toBe('AI response here')
  })

  it('skips empty messages', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('shows error message on IPC failure', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue(new Error('Connection lost'))

    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(result.current.messages[1].content).toContain('Connection lost')
  })

  it('clears conversation', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(result.current.messages).toHaveLength(2)

    act(() => {
      result.current.clearConversation()
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('aborts response', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    act(() => {
      result.current.abortResponse()
    })

    expect(result.current.isStreaming).toBe(false)
    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('copilot:chat-abort')
  })

  it('abortResponse marks empty assistant messages as aborted', async () => {
    // Make IPC hang so the assistant message stays empty
    vi.mocked(window.ipcRenderer.invoke).mockImplementation(
      (channel: string) =>
        channel === 'copilot:chat-abort' ? Promise.resolve() : new Promise(() => {}) // never resolves
    )

    const { result } = renderHook(() => useAssistantConversation(context))

    // Start sending — this creates a user + empty assistant message
    act(() => {
      void result.current.sendMessage('Hello')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].content).toBe('')

    // Abort while the assistant message still has empty content
    act(() => {
      result.current.abortResponse()
    })

    expect(result.current.messages[1].content).toBe('*(response aborted)*')
  })
})
