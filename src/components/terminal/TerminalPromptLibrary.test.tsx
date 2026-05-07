import type { RefObject } from 'react'
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

    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))

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

    expect(screen.getByRole('button', { name: 'Code review' })).toBeDisabled()
    expect(screen.getByText('The active terminal is still connecting.')).toBeInTheDocument()
  })

  it('shows loading feedback while prompts are loading', () => {
    mockUseTerminalPrompts.mockReturnValue(undefined)
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    expect(screen.getByText('Loading prompts…')).toBeInTheDocument()
  })

  it('shows loading feedback alongside the no-terminal status', () => {
    mockUseTerminalPrompts.mockReturnValue(undefined)
    render(<TerminalPromptLibrary activeTabId={null} onClose={vi.fn()} />)

    expect(screen.getByText('Loading prompts…')).toBeInTheDocument()
    expect(screen.getByText('Open a terminal tab to insert prompts.')).toBeInTheDocument()
  })

  it('shows the no-terminal message when there is no active tab', () => {
    render(<TerminalPromptLibrary activeTabId={null} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Code review' })).toBeDisabled()
    expect(screen.getByText('Open a terminal tab to insert prompts.')).toBeInTheDocument()
  })

  it('ignores clicks inside the owner element but closes on outside clicks', () => {
    const onClose = vi.fn()
    const owner = document.createElement('div')
    document.body.append(owner)
    const ownerRef: RefObject<HTMLDivElement | null> = { current: owner }

    render(<TerminalPromptLibrary activeTabId="term-1" ownerRef={ownerRef} onClose={onClose} />)

    fireEvent.mouseDown(owner)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()

    owner.remove()
  })

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores non-Escape key presses for dismissal', () => {
    const onClose = vi.fn()
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('creates a new prompt from the editor form', async () => {
    mockUseTerminalPrompts.mockReturnValue([])
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))
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

  it('shows a validation error when saving without a title', async () => {
    mockUseTerminalPrompts.mockReturnValue([])
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize the bug and propose a fix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('shows a validation error when saving without prompt content', async () => {
    mockUseTerminalPrompts.mockReturnValue([])
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Triage issue' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Prompt content is required')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('falls back to the default save message for non-Error rejections', async () => {
    mockUseTerminalPrompts.mockReturnValue([])
    mockCreate.mockRejectedValueOnce('nope')
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Triage issue' } })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Summarize the bug and propose a fix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save prompt')
  })

  it('updates an existing prompt from edit mode', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
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

  it('returns from the editor to the prompt list when backing out', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Code review' })).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument()
  })

  it('falls back to "Edit prompt" when an edited prompt title is blank', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '   ' } })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit prompt' })).toBeInTheDocument()
    })
  })

  it('deletes a prompt after confirmation', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ id: 'prompt-1' })
    })
  })

  it('does not delete a prompt when confirmation is canceled', async () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Keep' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('falls back to the default delete message for non-Error rejections', async () => {
    mockRemove.mockRejectedValueOnce('boom')
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete prompt')
  })

  it('surfaces clipboard failures after pasting into the terminal', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('clipboard denied'))
    const onClose = vi.fn()

    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))

    await waitFor(() => {
      expect(mockPasteIntoTerminal).toHaveBeenCalledWith('term-1', 'Review this diff carefully')
      expect(
        screen.getByText('Prompt pasted into the terminal, but clipboard copy failed.')
      ).toBeInTheDocument()
    })

    expect(onClose).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('uses the execCommand fallback when the clipboard API is unavailable', async () => {
    const onClose = vi.fn()
    const execCommand = vi.fn()

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })

    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('shows the reconnecting message when the terminal paste handler disappears before use', async () => {
    const onClose = vi.fn()
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)

    mockGetSessionId.mockReturnValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The active terminal is still connecting. Try again in a moment.'
    )
    expect(mockMarkUsed).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the reconnecting message when pasting into the terminal fails', async () => {
    const onClose = vi.fn()
    mockPasteIntoTerminal.mockReturnValue(false)

    render(<TerminalPromptLibrary activeTabId="term-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Code review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The active terminal is still connecting. Try again in a moment.'
    )
    expect(mockMarkUsed).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the menu compact and only shows full prompt details in edit mode', () => {
    render(<TerminalPromptLibrary activeTabId="term-1" onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Code review' })).toBeInTheDocument()
    expect(screen.queryByText('Review this diff carefully')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Code review' }))

    expect(screen.getByLabelText('Prompt')).toHaveValue('Review this diff carefully')
  })
})
