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
  const context = { viewType: 'welcome' as const }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAssistantConversation).mockReturnValue({
      messages: [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
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
})
