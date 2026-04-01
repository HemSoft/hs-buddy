import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RepoPicker } from './RepoPicker'

const mocks = vi.hoisted(() => ({
  useRepoBookmarks: vi.fn(),
  inlineDropdown: vi.fn(),
}))

vi.mock('../../hooks/useConvex', () => ({
  useRepoBookmarks: () => mocks.useRepoBookmarks(),
}))

vi.mock('../InlineDropdown', () => ({
  InlineDropdown: (props: {
    value: string
    options: { value: string; label: string; hint?: string }[]
    onChange: (value: string) => void
    placeholder?: string
  }) => {
    mocks.inlineDropdown(props)
    return (
      <button
        data-testid="inline-dropdown"
        onClick={() => props.onChange('relias-engineering/hs-buddy')}
      >
        {props.value || props.placeholder}
      </button>
    )
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RepoPicker', () => {
  it('shows an inline loading state while bookmarks are loading', () => {
    mocks.useRepoBookmarks.mockReturnValue(undefined)

    render(<RepoPicker value="" onChange={vi.fn()} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders grouped and sorted repositories in select mode', () => {
    const onChange = vi.fn()
    mocks.useRepoBookmarks.mockReturnValue([
      { owner: 'relias-engineering', repo: 'other-repo', folder: 'Work' },
      { owner: 'relias-engineering', repo: 'hs-buddy', folder: 'Work' },
      { owner: 'hemsoft', repo: 'alpha', folder: 'Personal' },
    ])

    render(<RepoPicker value="" onChange={onChange} variant="select" />)

    const select = screen.getByRole('combobox')
    expect(screen.getByRole('option', { name: 'No repo' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Personal' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Work' })).toBeInTheDocument()

    const options = screen.getAllByRole('option').map(option => option.textContent)
    expect(options).toEqual([
      'No repo',
      'hemsoft/alpha',
      'relias-engineering/hs-buddy',
      'relias-engineering/other-repo',
    ])

    fireEvent.change(select, { target: { value: 'relias-engineering/hs-buddy' } })
    expect(onChange).toHaveBeenCalledWith('relias-engineering/hs-buddy')
  })

  it('shows the empty state hint when no bookmarks exist', () => {
    mocks.useRepoBookmarks.mockReturnValue([])

    render(<RepoPicker value="" onChange={vi.fn()} variant="select" />)

    expect(
      screen.getByText('No bookmarked repos. Add repos from the Repos view.')
    ).toBeInTheDocument()
  })

  it('passes sorted repo options to the inline dropdown and supports disabling the none option', async () => {
    const onChange = vi.fn()
    mocks.useRepoBookmarks.mockReturnValue([
      { owner: 'relias-engineering', repo: 'hs-buddy', folder: 'Work' },
      { owner: 'hemsoft', repo: 'alpha', folder: 'Personal' },
    ])

    render(
      <RepoPicker
        value=""
        onChange={onChange}
        placeholder="Choose repo"
        allowNone={false}
        disabled
      />
    )

    await waitFor(() => expect(mocks.inlineDropdown).toHaveBeenCalled())
    const [lastProps] = mocks.inlineDropdown.mock.lastCall ?? []
    expect(lastProps).toEqual(
      expect.objectContaining({
        disabled: true,
        options: [
          { value: 'hemsoft/alpha', label: 'hemsoft/alpha', hint: 'Personal' },
          {
            value: 'relias-engineering/hs-buddy',
            label: 'relias-engineering/hs-buddy',
            hint: 'Work',
          },
        ],
      })
    )

    fireEvent.click(screen.getByTestId('inline-dropdown'))
    expect(onChange).toHaveBeenCalledWith('relias-engineering/hs-buddy')
  })
})
