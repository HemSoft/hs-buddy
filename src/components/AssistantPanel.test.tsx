import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AssistantPanel } from './AssistantPanel'

const mockSendMessage = vi.fn()
const mockClearConversation = vi.fn()
const mockAbortResponse = vi.fn()

vi.mock('../hooks/useAssistantConversation', () => ({
  useAssistantConversation: vi.fn(),
}))

import { useAssistantConversation } from '../hooks/useAssistantConversation'

vi.mock('../hooks/useExternalMarkdownLinks', () => ({
  useExternalMarkdownLinks: vi.fn(),
}))

vi.mock('@uiw/react-markdown-preview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

describe('AssistantPanel', () => {
  const context = { viewType: 'welcome' as const, viewId: null, summary: '', metadata: {} }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
      ],
      isStreaming: false,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
  })

  it('renders header', () => {
    render(<AssistantPanel context={context} />)
    expect(screen.getByText('Copilot Assistant')).toBeTruthy()
  })

  it('renders messages', () => {
    render(<AssistantPanel context={context} />)
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByText('Hi there!')).toBeTruthy()
  })

  it('renders suggested prompts when no messages', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [],
      isStreaming: false,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    render(<AssistantPanel context={context} />)
    expect(screen.getByText('What can you do?')).toBeTruthy()
  })

  it('sends message on suggestion click', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [],
      isStreaming: false,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    render(<AssistantPanel context={context} />)
    fireEvent.click(screen.getByText('What can you do?'))
    expect(mockSendMessage).toHaveBeenCalledWith('What can you do?')
  })

  it('renders input textarea', () => {
    render(<AssistantPanel context={context} />)
    expect(screen.getByPlaceholderText('Ask a question...')).toBeTruthy()
  })

  it('sends message when assistant:send-prompt event is dispatched', () => {
    render(<AssistantPanel context={context} />)
    window.dispatchEvent(
      new CustomEvent('assistant:send-prompt', { detail: 'Address unresolved comments' })
    )
    expect(mockSendMessage).toHaveBeenCalledWith('Address unresolved comments')
  })

  it('ignores assistant:send-prompt with empty detail', () => {
    render(<AssistantPanel context={context} />)
    window.dispatchEvent(new CustomEvent('assistant:send-prompt', { detail: '' }))
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('sends message with model override when detail is an object', () => {
    render(<AssistantPanel context={context} />)
    window.dispatchEvent(
      new CustomEvent('assistant:send-prompt', {
        detail: { prompt: 'Review this', model: 'gpt-4' },
      })
    )
    expect(mockSendMessage).toHaveBeenCalledWith('Review this', 'gpt-4')
  })

  it('sends input on Enter key (non-shift)', () => {
    render(<AssistantPanel context={context} />)
    const textarea = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(textarea, { target: { value: 'Hello bot' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).toHaveBeenCalledWith('Hello bot')
  })

  it('does not send on Shift+Enter', () => {
    render(<AssistantPanel context={context} />)
    const textarea = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(textarea, { target: { value: 'multi line' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('does not send empty input on Enter', () => {
    render(<AssistantPanel context={context} />)
    const textarea = screen.getByPlaceholderText('Ask a question...')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('shows stop button when streaming', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }],
      isStreaming: true,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    render(<AssistantPanel context={context} />)
    const stopBtn = screen.getByTitle('Stop')
    fireEvent.click(stopBtn)
    expect(mockAbortResponse).toHaveBeenCalled()
  })

  it('clears conversation on button click', () => {
    render(<AssistantPanel context={context} />)
    const clearBtn = screen.getByTitle('Clear conversation')
    fireEvent.click(clearBtn)
    expect(mockClearConversation).toHaveBeenCalled()
  })

  it('renders context badge when viewId is set', () => {
    const ctxWithView = {
      viewType: 'pr-detail' as const,
      viewId: 'pr-1',
      summary: 'Fix login PR',
      metadata: {},
    }
    render(<AssistantPanel context={ctxWithView} />)
    expect(screen.getByText('Fix login PR')).toBeTruthy()
  })

  it('shows loading state for assistant message with empty content', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: '', timestamp: Date.now() },
      ],
      isStreaming: true,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    render(<AssistantPanel context={context} />)
    expect(screen.getByText('Thinking...')).toBeTruthy()
  })

  it('uses pr-detail suggestions when viewType is pr-detail', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [],
      isStreaming: false,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    const ctxPR = { viewType: 'pr-detail' as const, viewId: null, summary: '', metadata: {} }
    render(<AssistantPanel context={ctxPR} />)
    expect(screen.getByText('Summarize this PR')).toBeTruthy()
  })

  it('falls back to welcome suggestions for unknown viewType', () => {
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [],
      isStreaming: false,
      sendMessage: mockSendMessage,
      clearConversation: mockClearConversation,
      abortResponse: mockAbortResponse,
    })
    const ctxUnknown = {
      viewType: 'settings' as never,
      viewId: null,
      summary: '',
      metadata: {},
    }
    render(<AssistantPanel context={ctxUnknown} />)
    expect(screen.getByText('What can you do?')).toBeTruthy()
  })

  it('auto-resizes textarea on input change', () => {
    render(<AssistantPanel context={context} />)
    const textarea = screen.getByPlaceholderText('Ask a question...') as HTMLTextAreaElement

    Object.defineProperty(textarea, 'scrollHeight', { value: 80, configurable: true })

    fireEvent.change(textarea, { target: { value: 'Hello world' } })

    // The useEffect sets height = 'auto' then `${Math.min(scrollHeight, 120)}px`
    expect(textarea.style.height).toBeTruthy()
  })
})
