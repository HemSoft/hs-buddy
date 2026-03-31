import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRInfoCard } from './PRInfoCard'

const mockOpenExternal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'shell', {
    value: { openExternal: mockOpenExternal },
    writable: true,
    configurable: true,
  })
})

describe('PRInfoCard', () => {
  const props = {
    prTitle: 'Fix login redirect loop',
    org: 'acme',
    repo: 'web-app',
    prNumber: 42,
    author: 'johndoe',
    prUrl: 'https://github.com/acme/web-app/pull/42',
  }

  it('renders PR title', () => {
    render(<PRInfoCard {...props} />)
    expect(screen.getByText('Fix login redirect loop')).toBeTruthy()
  })

  it('renders org/repo', () => {
    render(<PRInfoCard {...props} />)
    expect(screen.getByText('acme/web-app')).toBeTruthy()
  })

  it('renders PR number', () => {
    render(<PRInfoCard {...props} />)
    expect(screen.getByText('#42')).toBeTruthy()
  })

  it('renders author', () => {
    render(<PRInfoCard {...props} />)
    expect(screen.getByText('johndoe')).toBeTruthy()
  })

  it('opens PR URL when View PR clicked', () => {
    render(<PRInfoCard {...props} />)
    fireEvent.click(screen.getByText('View PR'))
    expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/acme/web-app/pull/42')
  })
})
