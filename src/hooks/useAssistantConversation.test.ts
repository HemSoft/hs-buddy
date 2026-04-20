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

  it('includes model in IPC payload when model is provided', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello', 'gpt-4')
    })

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
      'copilot:chat-send',
      expect.objectContaining({ model: 'gpt-4' })
    )
  })

  it('uses fallback content when response is falsy', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockResolvedValue(null)

    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(result.current.messages[1].content).toBe('*No response received.*')
  })

  it('handles non-Error exception in sendMessage', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockRejectedValue('string error')

    const { result } = renderHook(() => useAssistantConversation(context))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(result.current.messages[1].content).toContain('string error')
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

  it('discards response if aborted before IPC resolves', async () => {
    let resolveIpc: (value: unknown) => void
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) =>
      channel === 'copilot:chat-abort'
        ? Promise.resolve()
        : new Promise(resolve => {
            resolveIpc = resolve
          })
    )

    const { result } = renderHook(() => useAssistantConversation(context))

    act(() => {
      void result.current.sendMessage('Hello')
    })

    // Abort while IPC is still pending
    act(() => {
      result.current.abortResponse()
    })

    // Now resolve the IPC — response should be discarded
    await act(async () => {
      resolveIpc!('Late response')
      await Promise.resolve()
    })

    // Assistant message should still show aborted, not the late response
    expect(result.current.messages[1].content).toBe('*(response aborted)*')
  })

  it('discards error if aborted before IPC rejects', async () => {
    let rejectIpc: (reason: unknown) => void
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) =>
      channel === 'copilot:chat-abort'
        ? Promise.resolve()
        : new Promise((_resolve, reject) => {
            rejectIpc = reject
          })
    )

    const { result } = renderHook(() => useAssistantConversation(context))

    act(() => {
      void result.current.sendMessage('Hello')
    })

    // Abort while IPC is still pending
    act(() => {
      result.current.abortResponse()
    })

    // Now reject the IPC — error should be discarded
    await act(async () => {
      rejectIpc!(new Error('Late error'))
      await Promise.resolve()
    })

    // Assistant message should still show aborted, not the error
    expect(result.current.messages[1].content).toBe('*(response aborted)*')
  })

  it('silently swallows error when copilot:chat-abort IPC rejects', async () => {
    vi.mocked(window.ipcRenderer.invoke).mockImplementation((channel: string) =>
      channel === 'copilot:chat-abort'
        ? Promise.reject(new Error('abort failed'))
        : Promise.resolve('AI response here')
    )

    const { result } = renderHook(() => useAssistantConversation(context))

    act(() => {
      result.current.abortResponse()
    })

    // Wait for the rejected promise .catch() to execute
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isStreaming).toBe(false)
  })

  it('includes conversation history on multi-turn messages', async () => {
    const { result } = renderHook(() => useAssistantConversation(context))

    // First message
    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    // Second message - now there are existing messages to map as history
    await act(async () => {
      await result.current.sendMessage('Follow up')
    })

    expect(result.current.messages).toHaveLength(4)
    // Verify history was passed (the map callback at line 47 executes)
    const calls = vi.mocked(window.ipcRenderer.invoke).mock.calls
    const secondCall = calls.find(
      c => c[0] === 'copilot:chat-send' && (c[1] as { message: string }).message === 'Follow up'
    )
    expect(secondCall).toBeDefined()
    expect((secondCall![1] as { conversationHistory: unknown[] }).conversationHistory).toHaveLength(
      2
    )
  })
})
