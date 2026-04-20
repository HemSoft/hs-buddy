import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContributionGraph } from './ContributionGraph'
import type { ContributionWeek } from '../api/github'

const WEEKS: ContributionWeek[] = [
  {
    contributionDays: [
      { date: '2025-01-06', contributionCount: 3, color: '#30a14e' },
      { date: '2025-01-07', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-01-08', contributionCount: 5, color: '#216e39' },
      { date: '2025-01-09', contributionCount: 1, color: '#9be9a8' },
      { date: '2025-01-10', contributionCount: 2, color: '#40c463' },
      { date: '2025-01-11', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-01-12', contributionCount: 0, color: '#ebedf0' },
    ],
  },
  {
    contributionDays: [{ date: '2025-01-13', contributionCount: 4, color: '#30a14e' }],
  },
  {
    contributionDays: [
      { date: '2025-02-03', contributionCount: 10, color: '#216e39' },
      { date: '2025-02-04', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-02-05', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-02-06', contributionCount: 7, color: '#30a14e' },
      { date: '2025-02-07', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-02-08', contributionCount: 0, color: '#ebedf0' },
      { date: '2025-02-09', contributionCount: 0, color: '#ebedf0' },
    ],
  },
]

describe('ContributionGraph', () => {
  it('renders total contributions text', () => {
    render(<ContributionGraph weeks={WEEKS} totalContributions={1234} />)
    expect(screen.getByText('1,234 contributions in the last year')).toBeTruthy()
  })

  it('renders SVG element', () => {
    const { container } = render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders day-of-week labels', () => {
    render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    expect(screen.getByText('Mon')).toBeTruthy()
    expect(screen.getByText('Wed')).toBeTruthy()
    expect(screen.getByText('Fri')).toBeTruthy()
  })

  it('renders month labels', () => {
    render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    expect(screen.getByText('Jan')).toBeTruthy()
    expect(screen.getByText('Feb')).toBeTruthy()
  })

  it('renders contribution cells as rects', () => {
    const { container } = render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    const rects = container.querySelectorAll('rect.ud-contrib-cell')
    expect(rects.length).toBe(15) // 7 + 1 + 7 days across 3 weeks
  })

  it('renders contribution count in title elements', () => {
    const { container } = render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    const titles = container.querySelectorAll('title')
    const texts = Array.from(titles).map(t => t.textContent)
    expect(texts.some(t => t?.includes('3 contributions on 2025-01-06'))).toBe(true)
    expect(texts.some(t => t?.includes('0 contributions on 2025-01-07'))).toBe(true)
  })

  it('uses singular "contribution" for count of 1', () => {
    const { container } = render(<ContributionGraph weeks={WEEKS} totalContributions={28} />)
    const titles = container.querySelectorAll('title')
    const texts = Array.from(titles).map(t => t.textContent)
    expect(texts.some(t => t?.includes('1 contribution on 2025-01-09'))).toBe(true)
  })

  it('handles weeks with empty contributionDays (skips with continue)', () => {
    const weeksWithEmpty: ContributionWeek[] = [
      { contributionDays: [] },
      {
        contributionDays: [{ date: '2025-03-01', contributionCount: 1, color: '#30a14e' }],
      },
    ]
    const { container } = render(
      <ContributionGraph weeks={weeksWithEmpty} totalContributions={1} />
    )
    const rects = container.querySelectorAll('rect.ud-contrib-cell')
    expect(rects.length).toBe(1)
    expect(screen.getByText('Mar')).toBeTruthy()
  })

  it('passes through custom/dark colors unchanged', () => {
    const customWeeks: ContributionWeek[] = [
      {
        contributionDays: [{ date: '2025-03-01', contributionCount: 1, color: '#ff00ff' }],
      },
    ]
    const { container } = render(<ContributionGraph weeks={customWeeks} totalContributions={1} />)
    const rects = container.querySelectorAll('rect.ud-contrib-cell')
    // Custom color should be passed through toDarkColor unchanged
    expect(rects[0].getAttribute('fill')).toBe('#ff00ff')
  })
})
