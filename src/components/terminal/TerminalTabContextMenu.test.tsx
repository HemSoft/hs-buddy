import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./TerminalTabContextMenu.css', () => ({}))

import { TerminalTabContextMenu } from './TerminalTabContextMenu'
import type { TerminalTab } from '../../hooks/useTerminalPanel'

const makeTab = (overrides: Partial<TerminalTab> = {}): TerminalTab => ({
  id: 'tab-1',
  title: 'My Terminal',
  cwd: '/home/user',
  ...overrides,
})

const defaultProps = () => ({
  x: 100,
  y: 200,
  tab: makeTab(),
  onRename: vi.fn(),
  onSetColor: vi.fn(),
  onOpenFolderView: vi.fn(),
  onClose: vi.fn(),
})

afterEach(cleanup)

describe('TerminalTabContextMenu', () => {
  describe('layout and positioning', () => {
    it('renders overlay and menu at correct position', () => {
      const props = defaultProps()
      const { container } = render(<TerminalTabContextMenu {...props} />)

      const overlay = container.querySelector('.terminal-ctx-overlay')
      expect(overlay).toBeInTheDocument()

      const menu = container.querySelector('.terminal-ctx-menu')
      expect(menu).toBeInTheDocument()
      expect(menu).toHaveStyle({ top: '200px', left: '100px' })
    })

    it('clicking overlay calls onClose', () => {
      const props = defaultProps()
      const { container } = render(<TerminalTabContextMenu {...props} />)

      const overlay = container.querySelector('.terminal-ctx-overlay')!
      fireEvent.click(overlay)
      expect(props.onClose).toHaveBeenCalledOnce()
    })
  })

  describe('menu mode', () => {
    it('shows Rename button', () => {
      render(<TerminalTabContextMenu {...defaultProps()} />)
      expect(screen.getByText('Rename')).toBeInTheDocument()
    })

    it('clicking Rename switches to rename mode with input', () => {
      const props = defaultProps()
      render(<TerminalTabContextMenu {...props} />)

      fireEvent.click(screen.getByText('Rename'))

      expect(screen.queryByText('Rename')).not.toBeInTheDocument()
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('My Terminal')
    })

    it('shows Folder View button when tab.cwd is truthy', () => {
      render(<TerminalTabContextMenu {...defaultProps()} />)
      expect(screen.getByText('Folder View')).toBeInTheDocument()
    })

    it('does NOT show Folder View when tab.cwd is empty', () => {
      const props = defaultProps()
      props.tab = makeTab({ cwd: '' })
      render(<TerminalTabContextMenu {...props} />)
      expect(screen.queryByText('Folder View')).not.toBeInTheDocument()
    })

    it('clicking Folder View calls onOpenFolderView and onClose', () => {
      const props = defaultProps()
      render(<TerminalTabContextMenu {...props} />)

      fireEvent.click(screen.getByText('Folder View'))
      expect(props.onOpenFolderView).toHaveBeenCalledWith('/home/user')
      expect(props.onClose).toHaveBeenCalledOnce()
    })
  })

  describe('color swatches', () => {
    it('shows all 9 color swatches', () => {
      const { container } = render(<TerminalTabContextMenu {...defaultProps()} />)
      const swatches = container.querySelectorAll('.terminal-ctx-color-swatch')
      expect(swatches).toHaveLength(9)
    })

    it('active swatch has active class when tab.color matches', () => {
      const props = defaultProps()
      props.tab = makeTab({ color: '#e74856' })
      const { container } = render(<TerminalTabContextMenu {...props} />)

      const redSwatch = container.querySelector('.terminal-ctx-color-swatch[title="Red"]')
      expect(redSwatch).toHaveClass('active')

      const blueSwatch = container.querySelector('.terminal-ctx-color-swatch[title="Blue"]')
      expect(blueSwatch).not.toHaveClass('active')
    })

    it('clicking a color swatch calls onSetColor and onClose', () => {
      const props = defaultProps()
      const { container } = render(<TerminalTabContextMenu {...props} />)

      const greenSwatch = container.querySelector('.terminal-ctx-color-swatch[title="Green"]')!
      fireEvent.click(greenSwatch)

      expect(props.onSetColor).toHaveBeenCalledWith('tab-1', '#16c60c')
      expect(props.onClose).toHaveBeenCalledOnce()
    })

    it('shows Reset color button when tab.color is set', () => {
      const props = defaultProps()
      props.tab = makeTab({ color: '#e74856' })
      render(<TerminalTabContextMenu {...props} />)
      expect(screen.getByTitle('Reset color')).toBeInTheDocument()
    })

    it('does NOT show Reset color button when tab.color is undefined', () => {
      const props = defaultProps()
      props.tab = makeTab({ color: undefined })
      render(<TerminalTabContextMenu {...props} />)
      expect(screen.queryByTitle('Reset color')).not.toBeInTheDocument()
    })

    it('clicking Reset color calls onSetColor(id, undefined) and onClose', () => {
      const props = defaultProps()
      props.tab = makeTab({ color: '#3b78ff' })
      render(<TerminalTabContextMenu {...props} />)

      fireEvent.click(screen.getByTitle('Reset color'))
      expect(props.onSetColor).toHaveBeenCalledWith('tab-1', undefined)
      expect(props.onClose).toHaveBeenCalledOnce()
    })
  })

  describe('Escape key', () => {
    it('calls onClose on Escape keydown', () => {
      const props = defaultProps()
      render(<TerminalTabContextMenu {...props} />)

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(props.onClose).toHaveBeenCalledOnce()
    })
  })

  describe('rename mode', () => {
    const enterRenameMode = (props: ReturnType<typeof defaultProps>) => {
      render(<TerminalTabContextMenu {...props} />)
      fireEvent.click(screen.getByText('Rename'))
      return screen.getByRole('textbox')
    }

    it('input shows current tab title', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)
      expect(input).toHaveValue('My Terminal')
    })

    it('typing changes the input value', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.change(input, { target: { value: 'New Name' } })
      expect(input).toHaveValue('New Name')
    })

    it('pressing Enter with new value calls onRename and onClose', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.change(input, { target: { value: 'Renamed Tab' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(props.onRename).toHaveBeenCalledWith('tab-1', 'Renamed Tab')
      expect(props.onClose).toHaveBeenCalled()
    })

    it('pressing Enter with same value does NOT call onRename but calls onClose', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.keyDown(input, { key: 'Enter' })

      expect(props.onRename).not.toHaveBeenCalled()
      expect(props.onClose).toHaveBeenCalled()
    })

    it('pressing Enter with whitespace-only value does NOT call onRename but calls onClose', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(props.onRename).not.toHaveBeenCalled()
      expect(props.onClose).toHaveBeenCalled()
    })

    it('pressing Escape in rename mode calls onClose', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(props.onClose).toHaveBeenCalled()
    })

    it('blur triggers handleRenameSubmit with changed value', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.change(input, { target: { value: 'Blurred Name' } })
      fireEvent.blur(input)

      expect(props.onRename).toHaveBeenCalledWith('tab-1', 'Blurred Name')
      expect(props.onClose).toHaveBeenCalled()
    })

    it('blur with unchanged value does NOT call onRename but calls onClose', () => {
      const props = defaultProps()
      const input = enterRenameMode(props)

      fireEvent.blur(input)

      expect(props.onRename).not.toHaveBeenCalled()
      expect(props.onClose).toHaveBeenCalled()
    })
  })
})
