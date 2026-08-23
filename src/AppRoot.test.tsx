import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('./App', () => ({
  default: () => {
    throw new Error('startup authentication failed')
  },
}))

vi.mock('./providers/ConvexClientProvider', () => ({
  ConvexClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { AppRoot } from './AppRoot'

describe('AppRoot', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows a visible startup error when App throws', () => {
    render(<AppRoot />)

    expect(screen.getByRole('heading', { name: "Buddy couldn't start" })).toBeInTheDocument()
    expect(screen.getByText('startup authentication failed')).toBeInTheDocument()
  })

  it('lets the user retry startup', () => {
    render(<AppRoot />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByRole('heading', { name: "Buddy couldn't start" })).toBeInTheDocument()
  })
})
