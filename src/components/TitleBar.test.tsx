import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TitleBar } from './TitleBar'

// Mock IPC and shell on existing window
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'ipcRenderer', {
    value: { send: vi.fn(), invoke: vi.fn(), on: vi.fn(), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'shell', {
    value: { openExternal: vi.fn() },
    writable: true,
    configurable: true,
  })
})

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders brand, product name, and version', () => {
    render(<TitleBar />)
    expect(screen.getByText('HemSoft Developments')).toBeTruthy()
    expect(screen.getByText('Buddy')).toBeTruthy()
    expect(screen.getByText(/V0\.1/)).toBeTruthy()
  })

  it('renders File, Edit, View, and Help menus', () => {
    render(<TitleBar />)
    expect(screen.getByText('File')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(screen.getByText('View')).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('opens File menu on click and shows Exit item', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
  })

  it('opens Edit menu and shows standard items', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Undo')).toBeTruthy()
    expect(screen.getByText('Redo')).toBeTruthy()
    expect(screen.getByText('Cut')).toBeTruthy()
    expect(screen.getByText('Copy')).toBeTruthy()
    expect(screen.getByText('Paste')).toBeTruthy()
    expect(screen.getByText('Select All')).toBeTruthy()
  })

  it('opens View menu and shows zoom/reload items', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('View'))
    expect(screen.getByText('Zoom In')).toBeTruthy()
    expect(screen.getByText('Zoom Out')).toBeTruthy()
    expect(screen.getByText('Reset Zoom')).toBeTruthy()
    expect(screen.getByText('Reload')).toBeTruthy()
    expect(screen.getByText('Toggle DevTools')).toBeTruthy()
  })

  it('closes menu when clicking same menu again', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
    fireEvent.click(screen.getByText('File'))
    expect(screen.queryByText('Exit')).toBeFalsy()
  })

  it('switches to Edit menu on hover when a menu is open', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
    fireEvent.mouseEnter(screen.getByText('Edit'))
    expect(screen.getByText('Undo')).toBeTruthy()
  })

  it('sends window-minimize on minimize click', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByTitle('Minimize'))
    expect(window.ipcRenderer.send).toHaveBeenCalledWith('window-minimize')
  })

  it('sends window-maximize on maximize click', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByTitle('Maximize'))
    expect(window.ipcRenderer.send).toHaveBeenCalledWith('window-maximize')
  })

  it('calls window.close on close click', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<TitleBar />)
    fireEvent.click(screen.getByTitle('Close'))
    expect(closeSpy).toHaveBeenCalled()
    closeSpy.mockRestore()
  })

  it('opens About modal from Help menu', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('Help'))
    fireEvent.click(screen.getByText('About Buddy'))
    expect(screen.getByText('Your Universal Productivity Companion')).toBeTruthy()
  })

  it('shows Copilot toggle button', () => {
    render(<TitleBar />)
    expect(screen.getByTitle('Toggle Copilot Assistant (Ctrl+Shift+A)')).toBeTruthy()
  })

  it('applies active class to Copilot button when assistant is open', () => {
    render(<TitleBar assistantOpen />)
    const btn = screen.getByTitle('Toggle Copilot Assistant (Ctrl+Shift+A)')
    expect(btn.classList.contains('active')).toBe(true)
  })

  it('calls onToggleAssistant when Copilot button clicked', () => {
    const onToggle = vi.fn()
    render(<TitleBar onToggleAssistant={onToggle} />)
    fireEvent.click(screen.getByTitle('Toggle Copilot Assistant (Ctrl+Shift+A)'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('sends toggle-devtools when Toggle DevTools is clicked', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('View'))
    fireEvent.click(screen.getByText('Toggle DevTools'))
    expect(window.ipcRenderer.send).toHaveBeenCalledWith('toggle-devtools')
  })

  it('closes menu after clicking a menu item', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('View'))
    fireEvent.click(screen.getByText('Toggle DevTools'))
    // Menu should close after item action
    expect(screen.queryByText('Reload')).toBeFalsy()
  })

  it('closes menu after clicking a menu item that has no action', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Undo')).toBeTruthy()
    fireEvent.click(screen.getByText('Undo'))
    // Menu should close
    expect(screen.queryByText('Undo')).toBeFalsy()
  })

  it('does not close menu when mousedown occurs inside menu bar', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
  })

  it('applies active class to terminal button when terminalOpen is true', () => {
    render(<TitleBar terminalOpen />)
    const btn = screen.getByTitle('Toggle Terminal (Ctrl+`)')
    expect(btn.classList.contains('active')).toBe(true)
  })

  it('calls onToggleTerminal when terminal button is clicked', () => {
    const onToggle = vi.fn()
    render(<TitleBar onToggleTerminal={onToggle} />)
    fireEvent.click(screen.getByTitle('Toggle Terminal (Ctrl+`)'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not apply active class when no menu is hovered without an open menu', () => {
    render(<TitleBar />)
    // Hover over Edit without any menu open — should NOT open a dropdown
    fireEvent.mouseEnter(screen.getByText('Edit'))
    expect(screen.queryByText('Undo')).toBeFalsy()
  })

  it('closes menu when clicking outside', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
    fireEvent.mouseDown(document)
    expect(screen.queryByText('Exit')).toBeFalsy()
  })

  it('calls window.close when Exit menu item is clicked', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Exit'))
    expect(closeSpy).toHaveBeenCalled()
    closeSpy.mockRestore()
  })

  it('calls window.location.reload when Reload is clicked', () => {
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true,
    })
    render(<TitleBar />)
    fireEvent.click(screen.getByText('View'))
    fireEvent.click(screen.getByText('Reload'))
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('closes About modal when onClose is called', () => {
    render(<TitleBar />)
    // Open About modal
    fireEvent.click(screen.getByText('Help'))
    fireEvent.click(screen.getByText('About Buddy'))
    expect(screen.getByText('Your Universal Productivity Companion')).toBeTruthy()

    // Close About modal — find the modal's close button specifically
    const closeButton = document.querySelector('.about-close-button') as HTMLButtonElement
    fireEvent.click(closeButton)
    expect(screen.queryByText('Your Universal Productivity Companion')).toBeFalsy()
  })
})
