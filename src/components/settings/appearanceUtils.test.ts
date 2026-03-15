import { describe, expect, it } from 'vitest'
import { lightenColor, DARK_DEFAULTS, LIGHT_DEFAULTS } from './appearanceUtils'

describe('lightenColor', () => {
  it('returns the same color at 0%', () => {
    expect(lightenColor('#000000', 0)).toBe('#000000')
  })

  it('lightens black by 50%', () => {
    const result = lightenColor('#000000', 50)
    // 50% of 255 ≈ 128 → #808080
    expect(result).toBe('#808080')
  })

  it('caps at white when lightening by 100%', () => {
    const result = lightenColor('#808080', 100)
    // 128 + 255 → capped at 255
    expect(result).toBe('#ffffff')
  })

  it('lightens a colored hex', () => {
    const result = lightenColor('#0e639c', 10)
    // Each channel gets +25.5 ≈ 26
    // R: 14+26=40, G: 99+26=125, B: 156+26=182
    expect(result).toBe('#287db6')
  })

  it('does not exceed #ffffff', () => {
    const result = lightenColor('#ffffff', 50)
    expect(result).toBe('#ffffff')
  })
})

describe('DARK_DEFAULTS', () => {
  it('has expected accent color', () => {
    expect(DARK_DEFAULTS.accentColor).toBe('#0e639c')
  })

  it('has all required fields', () => {
    expect(DARK_DEFAULTS).toHaveProperty('fontColor')
    expect(DARK_DEFAULTS).toHaveProperty('bgPrimary')
    expect(DARK_DEFAULTS).toHaveProperty('bgSecondary')
    expect(DARK_DEFAULTS).toHaveProperty('statusBarBg')
    expect(DARK_DEFAULTS).toHaveProperty('statusBarFg')
  })
})

describe('LIGHT_DEFAULTS', () => {
  it('has expected accent color', () => {
    expect(LIGHT_DEFAULTS.accentColor).toBe('#0078d4')
  })

  it('has all required fields', () => {
    expect(LIGHT_DEFAULTS).toHaveProperty('fontColor')
    expect(LIGHT_DEFAULTS).toHaveProperty('bgPrimary')
    expect(LIGHT_DEFAULTS).toHaveProperty('bgSecondary')
    expect(LIGHT_DEFAULTS).toHaveProperty('statusBarBg')
    expect(LIGHT_DEFAULTS).toHaveProperty('statusBarFg')
  })
})
