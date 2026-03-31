import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DiffHunk } from './DiffHunk'

describe('DiffHunk', () => {
  it('renders a basic diff hunk with additions and deletions', () => {
    const hunk = '@@ -1,3 +1,3 @@\n context line\n-removed line\n+added line'
    const { container } = render(<DiffHunk hunk={hunk} />)

    expect(container.querySelector('.diff-hunk')).toBeTruthy()
    expect(container.querySelector('.diff-range')).toBeTruthy()
    expect(container.querySelector('.diff-add')).toBeTruthy()
    expect(container.querySelector('.diff-del')).toBeTruthy()
  })

  it('assigns diff-add class to added lines', () => {
    const hunk = '@@ -1,1 +1,2 @@\n context\n+new line'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const addLines = container.querySelectorAll('.diff-add')
    expect(addLines).toHaveLength(1)
    expect(addLines[0].textContent).toContain('+new line')
  })

  it('assigns diff-del class to removed lines', () => {
    const hunk = '@@ -1,2 +1,1 @@\n context\n-old line'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const delLines = container.querySelectorAll('.diff-del')
    expect(delLines).toHaveLength(1)
    expect(delLines[0].textContent).toContain('-old line')
  })

  it('displays correct line numbers for context lines', () => {
    const hunk = '@@ -10,2 +20,2 @@\n line A\n line B'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const contentLines = container.querySelectorAll('.diff-line:not(.diff-range)')
    const firstLine = contentLines[0]
    const nums = firstLine.querySelectorAll('.diff-line-num')
    expect(nums[0].textContent).toBe('10')
    expect(nums[1].textContent).toBe('20')
  })

  it('shows only new line number for additions', () => {
    const hunk = '@@ -5,1 +5,2 @@\n context\n+added'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const addLine = container.querySelector('.diff-add')
    const nums = addLine!.querySelectorAll('.diff-line-num')
    expect(nums[0].textContent).toBe('')
    expect(nums[1].textContent).toBe('6')
  })

  it('shows only old line number for deletions', () => {
    const hunk = '@@ -5,2 +5,1 @@\n context\n-removed'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const delLine = container.querySelector('.diff-del')
    const nums = delLine!.querySelectorAll('.diff-line-num')
    expect(nums[0].textContent).toBe('6')
    expect(nums[1].textContent).toBe('')
  })

  it('renders the @@ header as a diff range with empty line numbers', () => {
    const hunk = '@@ -1,2 +1,2 @@\n line1\n line2'
    const { container } = render(<DiffHunk hunk={hunk} />)

    const rangeLine = container.querySelector('.diff-range')
    expect(rangeLine).toBeTruthy()
    expect(rangeLine!.textContent).toContain('@@ -1,2 +1,2 @@')

    const nums = rangeLine!.querySelectorAll('.diff-line-num')
    expect(nums[0].textContent).toBe('')
    expect(nums[1].textContent).toBe('')
  })

  it('does not trim hunks with 6 or fewer content lines', () => {
    const hunk = '@@ -1,6 +1,6 @@\n l1\n l2\n l3\n l4\n l5\n l6'
    const { container } = render(<DiffHunk hunk={hunk} />)

    expect(container.querySelector('.diff-truncated')).toBeNull()
  })

  it('trims hunks with more than 6 content lines and shows an indicator', () => {
    const lines = ['@@ -1,10 +1,10 @@']
    for (let i = 1; i <= 10; i++) lines.push(` line ${i}`)
    const { container } = render(<DiffHunk hunk={lines.join('\n')} />)

    const truncated = container.querySelector('.diff-truncated')
    expect(truncated).toBeTruthy()
    expect(truncated?.textContent).toContain('⋯')
  })

  it('keeps only the last 6 content lines when trimmed', () => {
    const lines = ['@@ -1,10 +1,10 @@']
    for (let i = 1; i <= 10; i++) lines.push(` line ${i}`)
    const { container } = render(<DiffHunk hunk={lines.join('\n')} />)

    const contentLines = container.querySelectorAll(
      '.diff-line:not(.diff-range):not(.diff-truncated)'
    )
    expect(contentLines).toHaveLength(6)
    expect(contentLines[0].textContent).toContain('line 5')
    expect(contentLines[5].textContent).toContain('line 10')
  })

  it('correctly adjusts line numbers after trimming context lines', () => {
    const lines = ['@@ -1,10 +1,10 @@']
    for (let i = 1; i <= 10; i++) lines.push(` line ${i}`)
    const { container } = render(<DiffHunk hunk={lines.join('\n')} />)

    const contentLines = container.querySelectorAll(
      '.diff-line:not(.diff-range):not(.diff-truncated)'
    )
    const nums = contentLines[0].querySelectorAll('.diff-line-num')
    expect(nums[0].textContent).toBe('5')
    expect(nums[1].textContent).toBe('5')
  })

  it('adjusts line numbers correctly when trimmed lines include additions and deletions', () => {
    const hunk = [
      '@@ -1,8 +1,10 @@',
      ' context1',
      '+added1',
      '+added2',
      ' context2',
      '-removed1',
      ' context3',
      ' context4',
      ' context5',
      ' context6',
      ' context7',
    ].join('\n')
    const { container } = render(<DiffHunk hunk={hunk} />)

    const contentLines = container.querySelectorAll(
      '.diff-line:not(.diff-range):not(.diff-truncated)'
    )
    const firstNums = contentLines[0].querySelectorAll('.diff-line-num')
    expect(firstNums[0].textContent).toBe('3')
    expect(firstNums[1].textContent).toBe('')
  })

  it('handles hunks without an @@ header', () => {
    const hunk = '+added line\n-removed line\n context line'
    const { container } = render(<DiffHunk hunk={hunk} />)

    expect(container.querySelector('.diff-hunk')).toBeTruthy()
    expect(container.querySelector('.diff-range')).toBeNull()

    const addLine = container.querySelector('.diff-add')
    const nums = addLine!.querySelectorAll('.diff-line-num')
    expect(nums[1].textContent).toBe('1')
  })

  it('handles an empty hunk string', () => {
    const { container } = render(<DiffHunk hunk="" />)

    expect(container.querySelector('.diff-hunk')).toBeTruthy()
    expect(container.querySelectorAll('.diff-line')).toHaveLength(0)
  })
})
