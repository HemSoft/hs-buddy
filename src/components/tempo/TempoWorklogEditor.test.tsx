import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { TempoWorklog } from '../../types/tempo'
import { TempoWorklogEditor } from './TempoWorklogEditor'

const getAccounts = vi.fn()
const getProjectAccounts = vi.fn()

const existingWorklog: TempoWorklog = {
  id: 10,
  issueKey: 'PE-77',
  issueSummary: 'Existing worklog',
  hours: 2,
  date: '2026-03-10',
  startTime: '13:00',
  description: 'Existing note',
  accountKey: 'OPS',
  accountName: 'Operations',
}

function mountEditor(props: Partial<ComponentProps<typeof TempoWorklogEditor>> = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined)
  const onCancel = props.onCancel ?? vi.fn()

  render(
    <TempoWorklogEditor
      worklog={props.worklog ?? null}
      defaultDate={props.defaultDate ?? '2026-03-18'}
      defaultIssueKey={props.defaultIssueKey}
      defaultAccountKey={props.defaultAccountKey}
      defaultDescription={props.defaultDescription}
      existingWorklogs={props.existingWorklogs ?? []}
      onSave={onSave}
      onCancel={onCancel}
    />
  )

  return { onSave, onCancel }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('TempoWorklogEditor', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'tempo', {
      value: {
        getAccounts,
        getProjectAccounts,
      },
      writable: true,
      configurable: true,
    })

    getAccounts.mockResolvedValue({
      data: [
        { key: 'OPS', name: 'Operations' },
        { key: 'DEV', name: 'Development' },
      ],
    })
    getProjectAccounts.mockResolvedValue({
      data: [
        { key: 'CAPEX', name: 'Capital', isDefault: true },
        { key: 'OPS', name: 'Operations', isDefault: false },
      ],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('loads accounts and validates that an issue key is required', async () => {
    mountEditor()

    await flushPromises()

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Operations (OPS)' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByText('Issue key is required')).toBeInTheDocument()
  })

  it('loads project accounts after the issue key debounce and auto-selects the default', async () => {
    mountEditor()

    fireEvent.change(screen.getByLabelText('Issue Key'), {
      target: { value: 'pe-992' },
    })

    await act(async () => {
      await wait(450)
      await flushPromises()
    })

    await waitFor(() => {
      expect(getProjectAccounts).toHaveBeenCalledWith('PE')
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Account')).toHaveValue('CAPEX')
    })
  })

  it('submits a new worklog with a normalized issue key and next available start time', async () => {
    const { onSave } = mountEditor({
      existingWorklogs: [
        {
          ...existingWorklog,
          id: 11,
          date: '2026-03-18',
          startTime: '08:00',
          hours: 1,
        },
      ],
    })

    fireEvent.change(screen.getByLabelText('Issue Key'), {
      target: { value: 'pe-992' },
    })
    fireEvent.change(screen.getByLabelText('Hours'), {
      target: { value: '2.5' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Writing tests' },
    })

    await act(async () => {
      await wait(450)
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Account')).toHaveValue('CAPEX')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        issueKey: 'PE-992',
        hours: 2.5,
        date: '2026-03-18',
        startTime: '09:00',
        description: 'Writing tests',
        accountKey: 'CAPEX',
      })
    })
  })

  it('uses the existing start time and disables the issue key when editing', async () => {
    const { onSave } = mountEditor({
      worklog: existingWorklog,
      existingWorklogs: [existingWorklog],
    })

    await flushPromises()

    await waitFor(() => {
      expect(getProjectAccounts).toHaveBeenCalledWith('PE')
    })

    expect(screen.getByLabelText('Issue Key')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Hours'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        issueKey: 'PE-77',
        hours: 3,
        date: '2026-03-10',
        startTime: '13:00',
        description: 'Existing note',
        accountKey: 'OPS',
      })
    })
  })

  it('shows save errors returned by onSave and closes on Escape when idle', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'))
    const onCancel = vi.fn()
    mountEditor({ onSave, onCancel })

    await flushPromises()

    fireEvent.change(screen.getByLabelText('Issue Key'), {
      target: { value: 'PE-500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Error: Save failed')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('uses defaultIssueKey, defaultAccountKey, and defaultDescription props', async () => {
    mountEditor({
      defaultIssueKey: 'TASK',
      defaultAccountKey: 'DEV',
      defaultDescription: 'default desc',
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Development (DEV)' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Issue Key')).toHaveValue('TASK')
    expect(screen.getByLabelText('Description')).toHaveValue('default desc')
    expect(screen.getByLabelText('Account')).toHaveValue('DEV')
  })

  it('handles getAccounts returning no data', async () => {
    getAccounts.mockResolvedValue({})
    mountEditor()
    await flushPromises()
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
    })
  })

  it('clears project accounts when issue key has no dash', async () => {
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE' } })
    await act(async () => {
      await wait(450)
      await flushPromises()
    })
    expect(getProjectAccounts).not.toHaveBeenCalled()
  })

  it('does not auto-select account when there is no default', async () => {
    getProjectAccounts.mockResolvedValue({
      data: [
        { key: 'A1', name: 'Account One', isDefault: false },
        { key: 'A2', name: 'Account Two', isDefault: false },
      ],
    })
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-992' } })
    await act(async () => {
      await wait(450)
      await flushPromises()
    })
    await waitFor(() => {
      expect(getProjectAccounts).toHaveBeenCalledWith('PE')
    })
    expect(screen.getByLabelText('Account')).toHaveValue('')
  })

  it('handles getProjectAccounts returning no data', async () => {
    getProjectAccounts.mockResolvedValue({})
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-992' } })
    await act(async () => {
      await wait(450)
      await flushPromises()
    })
    await waitFor(() => {
      expect(getProjectAccounts).toHaveBeenCalledWith('PE')
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Operations (OPS)' })).toBeInTheDocument()
    })
  })

  it('handles no project accounts data in edit mode', async () => {
    getProjectAccounts.mockResolvedValue({})
    mountEditor({
      worklog: existingWorklog,
      existingWorklogs: [existingWorklog],
    })
    await flushPromises()
    await waitFor(() => {
      expect(getProjectAccounts).toHaveBeenCalledWith('PE')
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Operations (OPS)' })).toBeInTheDocument()
    })
  })

  it('validates hours must be at most 24', async () => {
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '25' } })
    // Use fireEvent.submit to bypass HTML5 constraint validation on number input max
    fireEvent.submit(screen.getByLabelText('Issue Key').closest('form')!)
    expect(screen.getByText('Hours must be between 0 and 24')).toBeInTheDocument()
  })

  it('validates hours must be positive', async () => {
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0' } })
    // Use fireEvent.submit to bypass HTML5 constraint validation on number input min
    fireEvent.submit(screen.getByLabelText('Issue Key').closest('form')!)
    expect(screen.getByText('Hours must be between 0 and 24')).toBeInTheDocument()
  })

  it('validates non-numeric hours', async () => {
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Hours must be between 0 and 24')).toBeInTheDocument()
  })

  it('validates date is required', async () => {
    mountEditor()
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Date is required')).toBeInTheDocument()
  })

  it('does not close on Escape while saving', async () => {
    let resolveSave!: () => void
    const onSave = vi.fn().mockReturnValue(
      new Promise<void>(r => {
        resolveSave = r
      })
    )
    const onCancel = vi.fn()
    mountEditor({ onSave, onCancel })
    await flushPromises()

    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => {
      resolveSave()
    })
  })

  it('does not close on backdrop click while saving', async () => {
    let resolveSave!: () => void
    const onSave = vi.fn().mockReturnValue(
      new Promise<void>(r => {
        resolveSave = r
      })
    )
    const onCancel = vi.fn()
    mountEditor({ onSave, onCancel })
    await flushPromises()

    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'PE-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Close worklog editor'))
    expect(onCancel).not.toHaveBeenCalled()

    await act(async () => {
      resolveSave()
    })
  })

  it('ignores stale project account responses', async () => {
    let resolveFirst!: (value: unknown) => void
    getProjectAccounts.mockImplementationOnce(
      () =>
        new Promise(r => {
          resolveFirst = r
        })
    )

    mountEditor()

    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'AA-1' } })
    await act(async () => {
      await wait(450)
    })

    getProjectAccounts.mockResolvedValueOnce({
      data: [{ key: 'NEW', name: 'New', isDefault: true }],
    })
    fireEvent.change(screen.getByLabelText('Issue Key'), { target: { value: 'BB-2' } })
    await act(async () => {
      await wait(450)
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Account')).toHaveValue('NEW')
    })

    await act(async () => {
      resolveFirst({ data: [{ key: 'OLD', name: 'Old', isDefault: true }] })
      await flushPromises()
    })

    expect(screen.getByLabelText('Account')).toHaveValue('NEW')
  })

  it('sets userPickedAccount flag when account dropdown is changed manually', async () => {
    mountEditor()

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Operations (OPS)' })).toBeInTheDocument()
    })

    // Manually change the account dropdown — exercises lines 298-299
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'OPS' } })

    expect(screen.getByLabelText('Account')).toHaveValue('OPS')
  })
})
