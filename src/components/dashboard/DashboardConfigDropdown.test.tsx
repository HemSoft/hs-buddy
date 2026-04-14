import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardConfigDropdown } from './DashboardConfigDropdown'

vi.mock('lucide-react', () => ({
  Settings: () => <span data-testid="icon-settings" />,
  Eye: ({ className }: { className?: string }) => (
    <span data-testid="icon-eye" className={className} />
  ),
  EyeOff: ({ className }: { className?: string }) => (
    <span data-testid="icon-eye-off" className={className} />
  ),
}))

const sampleCards = [
  { id: 'weather', title: 'Weather', defaultVisible: true, span: 2 as const },
  { id: 'finance', title: 'Finance', defaultVisible: true, span: 2 as const },
  { id: 'pulse', title: 'Workspace Pulse', defaultVisible: false, span: 1 as const },
]

describe('DashboardConfigDropdown', () => {
  let isVisible: (id: string) => boolean
  let toggleCard: (id: string) => void

  beforeEach(() => {
    vi.clearAllMocks()
    isVisible = vi.fn<(id: string) => boolean>().mockImplementation(id => id !== 'pulse')
    toggleCard = vi.fn<(id: string) => void>()
  })

  it('renders trigger button', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    expect(screen.getByTitle('Configure dashboard cards')).toBeInTheDocument()
    expect(screen.getByText('Customize')).toBeInTheDocument()
  })

  it('menu is closed by default', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByTitle('Configure dashboard cards')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens menu when trigger is clicked', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByTitle('Configure dashboard cards')).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows card titles when menu is open', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByText('Weather')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Workspace Pulse')).toBeInTheDocument()
  })

  it('shows header text in menu', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByText('Dashboard Cards')).toBeInTheDocument()
  })

  it('shows Eye icon for visible cards and EyeOff for hidden', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getAllByTestId('icon-eye')).toHaveLength(2)
    expect(screen.getAllByTestId('icon-eye-off')).toHaveLength(1)
  })

  it('sets aria-checked based on visibility', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items[0]).toHaveAttribute('aria-checked', 'true')
    expect(items[1]).toHaveAttribute('aria-checked', 'true')
    expect(items[2]).toHaveAttribute('aria-checked', 'false')
  })

  it('calls toggleCard when a card item is clicked', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    fireEvent.click(screen.getByText('Finance'))
    expect(toggleCard).toHaveBeenCalledWith('finance')
  })

  it('closes menu when clicking outside', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes menu when Escape is pressed', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles menu closed on second click of trigger', () => {
    render(
      <DashboardConfigDropdown cards={sampleCards} isVisible={isVisible} toggleCard={toggleCard} />
    )
    const trigger = screen.getByTitle('Configure dashboard cards')
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders with empty cards array', () => {
    render(<DashboardConfigDropdown cards={[]} isVisible={isVisible} toggleCard={toggleCard} />)
    fireEvent.click(screen.getByTitle('Configure dashboard cards'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryAllByRole('menuitemcheckbox')).toHaveLength(0)
  })
})
