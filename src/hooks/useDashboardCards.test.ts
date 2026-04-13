import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDashboardCards, DASHBOARD_CARDS } from './useDashboardCards'

describe('useDashboardCards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns all cards with defaults', () => {
    const { result } = renderHook(() => useDashboardCards())
    expect(result.current.cards).toEqual(DASHBOARD_CARDS)
    expect(result.current.visibleCards.length).toBe(DASHBOARD_CARDS.length)
  })

  it('all cards are visible by default', () => {
    const { result } = renderHook(() => useDashboardCards())
    for (const card of DASHBOARD_CARDS) {
      expect(result.current.isVisible(card.id)).toBe(true)
    }
  })

  it('toggles card visibility', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })

    expect(result.current.isVisible('weather')).toBe(false)
    expect(result.current.visibleCards.find(c => c.id === 'weather')).toBeUndefined()
  })

  it('persists visibility to localStorage', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })

    // Re-render hook to simulate re-mount
    const { result: result2 } = renderHook(() => useDashboardCards())
    expect(result2.current.isVisible('weather')).toBe(false)
  })

  it('merges stored prefs with new cards gracefully', () => {
    // Store a partial config (missing some cards)
    localStorage.setItem(
      'dashboard:cards',
      JSON.stringify({ 'command-center': false })
    )

    const { result } = renderHook(() => useDashboardCards())
    expect(result.current.isVisible('command-center')).toBe(false)
    // Other cards should use their defaults
    expect(result.current.isVisible('workspace-pulse')).toBe(true)
    expect(result.current.isVisible('weather')).toBe(true)
  })

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem('dashboard:cards', 'not-json')

    const { result } = renderHook(() => useDashboardCards())
    // Should fall back to defaults
    expect(result.current.visibleCards.length).toBe(DASHBOARD_CARDS.length)
  })

  it('toggling card back on restores visibility', () => {
    const { result } = renderHook(() => useDashboardCards())

    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(false)

    act(() => {
      result.current.toggleCard('weather')
    })
    expect(result.current.isVisible('weather')).toBe(true)
  })
})
