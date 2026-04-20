import { describe, it, expect } from 'vitest'
import { getLabelStyle } from './labelStyle'

describe('getLabelStyle', () => {
  it('returns backgroundColor, color, and borderColor from a hex color', () => {
    const style = getLabelStyle('ff0000')
    expect(style).toEqual({
      backgroundColor: '#ff000020',
      color: '#ff0000',
      borderColor: '#ff000040',
    })
  })

  it('normalizes short (3-digit) color strings to 6-digit for valid CSS hex', () => {
    const style = getLabelStyle('abc')
    expect(style).toEqual({
      backgroundColor: '#aabbcc20',
      color: '#aabbcc',
      borderColor: '#aabbcc40',
    })
  })
})
