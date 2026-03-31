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

  it('closes menu when clicking outside', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Exit')).toBeTruthy()
    fireEvent.mouseDown(document)
    expect(screen.queryByText('Exit')).toBeFalsy()
  })
})
