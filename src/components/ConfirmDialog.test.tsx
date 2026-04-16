import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(props: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn()
  const onCancel = props.onCancel ?? vi.fn()
  const view = render(
    <ConfirmDialog
      message="Delete this item?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  )

  return { ...view, onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('renders the message text and focuses the confirm button', () => {
    renderDialog({ message: 'Are you sure?' })

    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus()
  })

  it('renders the optional description and wires up aria-describedby', () => {
    renderDialog({
      message: 'Delete item?',
      description: 'This action cannot be undone.',
    })

    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveAttribute(
      'aria-describedby',
      'confirm-dialog-desc'
    )
  })

  it('omits aria-describedby when no description is provided', () => {
    renderDialog({ message: 'Delete item?' })

    const dialog = screen.getByRole('alertdialog')
    expect(screen.queryByText('This action cannot be undone.')).not.toBeInTheDocument()
    expect(dialog).not.toHaveAttribute('aria-describedby')
  })

  it('renders default and custom button labels', () => {
    const { rerender } = renderDialog()

    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    rerender(
      <ConfirmDialog
        message="Delete this item?"
        confirmLabel="Yes, delete"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  it('calls the correct callbacks for confirm, cancel, escape, and overlay clicks', () => {
    const { onConfirm, onCancel } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('presentation'))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('does not cancel when clicking inside the dialog', () => {
    const { onCancel } = renderDialog()

    fireEvent.click(screen.getByRole('alertdialog'))

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders the warning icon and danger button class for the danger variant', () => {
    const { container } = renderDialog({ variant: 'danger' })

    expect(container.querySelector('.confirm-dialog-icon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('confirm-dialog-btn-danger')
  })

  it('omits the warning icon and uses the default confirm class for the default variant', () => {
    const { container } = renderDialog({ variant: 'default' })

    expect(container.querySelector('.confirm-dialog-icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('confirm-dialog-btn-confirm')
  })

  it('sets the expected alertdialog ARIA attributes', () => {
    renderDialog({
      message: 'Delete?',
      description: 'Cannot undo',
    })

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-desc')
  })

  it('does not call onCancel for non-Escape keys', () => {
    const { onCancel } = renderDialog()

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Tab' })

    expect(onCancel).not.toHaveBeenCalled()
  })
})
