import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { getWorkerIcon } from './jobRowUtils'

describe('getWorkerIcon', () => {
  it('returns Terminal icon for exec worker', () => {
    const { container } = render(getWorkerIcon('exec'))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.contains('worker-exec')).toBe(true)
  })

  it('returns Brain icon for ai worker', () => {
    const { container } = render(getWorkerIcon('ai'))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.contains('worker-ai')).toBe(true)
  })

  it('returns Zap icon for skill worker', () => {
    const { container } = render(getWorkerIcon('skill'))
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.classList.contains('worker-skill')).toBe(true)
  })

  it('respects custom size', () => {
    const { container } = render(getWorkerIcon('exec', 24))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })
})
