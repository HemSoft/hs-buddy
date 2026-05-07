import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./TerminalPromptLibrary.css', () => ({}))
vi.mock('../ConfirmDialog.css', () => ({}))

const mockUseTerminalPrompts = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockMarkUsed = vi.fn()
const mockGetSessionId = vi.fn()
const mockHasTerminalPasteHandler = vi.fn()
const mockPasteIntoTerminal = vi.fn()

vi.mock('../../hooks/useConvex', () => ({
  useTerminalPrompts: () => mockUseTerminalPrompts(),
  useTerminalPromptMutations: () => ({
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    markUsed: mockMarkUsed,
  }),
}))

vi.mock('./terminalSessions', () => ({
  getSessionId: (...args: unknown[]) => mockGetSessionId(...args),
  hasTerminalPasteHandler: (...args: unknown[]) => mockHasTerminalPasteHandler(...args),
  pasteIntoTerminal: (...args: unknown[]) => mockPasteIntoTerminal(...args),
}))

import { TerminalPromptLibrary } from './TerminalPromptLibrary'

const prompt = {
  _id: 'prompt-1',
  _creationTime: 1,
  title: 'Code review',
  content: 'Review this diff carefully',
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
}

describe('TerminalPromptLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTerminalPrompts.mockReturnValue([prompt])
    mockCreate.mockResolvedValue('prompt-2')
    mockUpdate.mockResolvedValue('prompt-1')
    mockRemove.mockResolvedValue('prompt-1')
    mockMarkUsed.mockResolvedValue('prompt-1')
    mockGetSessionId.mockReturnValue('session-1')
    mockHasTerminalPasteHandler.mockReturnValue(true)
    mockPasteIntoTerminal.mockReturnValue(true)

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(cleanup)

  it('uses a saved prompt by pasting into the active terminal and copying to clipboard', async () => {
    const onClose = vi.fn()
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use' }))

    await waitFor(() => {
      expect(mockPasteIntoTerminal).toHaveBeenCalledWith('term-1', 'Review this diff carefully')
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Review this diff carefully')
      expect(mockMarkUsed).toHaveBeenCalledWith({ id: 'prompt-1' })
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('disables prompt usage while the active terminal is still connecting', () => {
    mockGetSessionId.mockReturnValue(undefined)
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled()
    expect(screen.getAllByText('The active terminal is still connecting.')).toHaveLength(2)
  })

  it('creates a new prompt from the editor form', async () => {
    mockUseTerminalPrompts.mockReturnValue([])
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create prompt' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Triage issue' } })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize the bug and propose a fix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        title: 'Triage issue',
        content: 'Summarize the bug and propose a fix',
      })
    })
  })

  it('updates an existing prompt from edit mode', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Code review deluxe' } })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Review this diff carefully and call out risks' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update prompt' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 'prompt-1',
        title: 'Code review deluxe',
        content: 'Review this diff carefully and call out risks',
      })
    })
  })

  it('deletes a prompt after confirmation', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ id: 'prompt-1' })
    })
  })

  it('surfaces clipboard failures after pasting into the terminal', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('clipboard denied'))
    const onClose = vi.fn()

    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))

    await waitFor(() => {
      expect(mockPasteIntoTerminal).toHaveBeenCalledWith('term-1', 'Review this diff carefully')
      expect(
        screen.getByText('Prompt pasted into the terminal, but clipboard copy failed.')
      ).toBeInTheDocument()
    })

    expect(onClose).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
