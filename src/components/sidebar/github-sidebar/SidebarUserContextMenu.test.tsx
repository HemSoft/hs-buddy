import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SidebarUserContextMenu } from './SidebarUserContextMenu'

describe('SidebarUserContextMenu', () => {
  it('renders actions, positions the menu, and invokes handlers', () => {
    const onOpenProfile = vi.fn()
    const onRefresh = vi.fn()
    const onToggleFavorite = vi.fn()
    const onClose = vi.fn()

    render(
      <SidebarUserContextMenu
        displayName="Alice"
        org="relias-engineering"
        x={18}
        y={30}
        isFavorite={false}
        onOpenProfile={onOpenProfile}
        onRefresh={onRefresh}
        onToggleFavorite={onToggleFavorite}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /open profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }))
    fireEvent.click(screen.getByRole('button', { name: /favorite alice/i }))
    fireEvent.click(document.querySelector('.context-menu-overlay')!)

    expect(onOpenProfile).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onToggleFavorite).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.querySelector('.context-menu')).toHaveStyle({ top: '30px', left: '18px' })
  })

  it('shows the unfavorite label for favorite users', () => {
    render(
      <SidebarUserContextMenu
        displayName="Alice"
        org="relias-engineering"
        x={0}
        y={0}
        isFavorite
        onOpenProfile={vi.fn()}
        onRefresh={vi.fn()}
        onToggleFavorite={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /unfavorite alice/i })).toBeTruthy()
  })
})
