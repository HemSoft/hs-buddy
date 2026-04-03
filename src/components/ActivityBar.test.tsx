import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActivityBar } from './ActivityBar'

function renderActivityBar(selectedSection = 'github') {
  const onSectionSelect = vi.fn()
  const view = render(
    <ActivityBar selectedSection={selectedSection} onSectionSelect={onSectionSelect} />
  )

  return { ...view, onSectionSelect }
}

describe('ActivityBar', () => {
  it('renders all 10 section buttons', () => {
    renderActivityBar()

    const expectedLabels = [
      'GitHub',
      'Skills',
      'Tasks',
      'Insights',
      'Automation',
      'The Crew',
      'Tempo',
      'Bookmarks',
      'Copilot',
      'Settings',
    ]

    expect(screen.getAllByRole('button')).toHaveLength(expectedLabels.length)

    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the selected section as active', () => {
    renderActivityBar('skills')

    expect(screen.getByRole('button', { name: 'Skills' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'GitHub' })).not.toHaveClass('active')
  })

  it('calls onSectionSelect with the section id when clicked', async () => {
    const user = userEvent.setup()
    const { onSectionSelect } = renderActivityBar()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(onSectionSelect).toHaveBeenCalledTimes(1)
    expect(onSectionSelect).toHaveBeenCalledWith('settings')
  })

  it('calls the handler with correct ids for multiple sections', async () => {
    const user = userEvent.setup()
    const { onSectionSelect } = renderActivityBar()

    await user.click(screen.getByRole('button', { name: 'Automation' }))
    expect(onSectionSelect).toHaveBeenLastCalledWith('automation')

    await user.click(screen.getByRole('button', { name: 'Copilot' }))
    expect(onSectionSelect).toHaveBeenLastCalledWith('copilot')

    await user.click(screen.getByRole('button', { name: 'The Crew' }))
    expect(onSectionSelect).toHaveBeenLastCalledWith('crew')
  })

  it('shows tooltip text on mouse enter', async () => {
    const user = userEvent.setup()
    const { container } = renderActivityBar()

    await user.hover(screen.getByRole('button', { name: 'Insights' }))

    const tooltip = container.querySelector('.activity-bar-tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('Insights')
  })

  it('hides tooltip on mouse leave', async () => {
    const user = userEvent.setup()
    const { container } = renderActivityBar()
    const tasksButton = screen.getByRole('button', { name: 'Tasks' })

    await user.hover(tasksButton)
    expect(container.querySelector('.activity-bar-tooltip')).toHaveTextContent('Tasks')

    await user.unhover(tasksButton)

    expect(container.querySelector('.activity-bar-tooltip')).toBeNull()
  })

  it('does not show any tooltip initially', () => {
    const { container } = renderActivityBar()

    expect(container.querySelector('.activity-bar-tooltip')).toBeNull()
  })

  it('applies the active class only to the selected section', () => {
    renderActivityBar('copilot')

    const activeButtons = screen
      .getAllByRole('button')
      .filter(button => button.className.includes('active'))

    expect(activeButtons).toHaveLength(1)
    expect(activeButtons[0]).toBe(screen.getByRole('button', { name: 'Copilot' }))
  })

  it('updates the active state when selectedSection changes', () => {
    const onSectionSelect = vi.fn()
    const { rerender } = render(
      <ActivityBar selectedSection="github" onSectionSelect={onSectionSelect} />
    )

    expect(screen.getByRole('button', { name: 'GitHub' })).toHaveClass('active')

    rerender(<ActivityBar selectedSection="tasks" onSectionSelect={onSectionSelect} />)

    expect(screen.getByRole('button', { name: 'GitHub' })).not.toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveClass('active')
  })
})
