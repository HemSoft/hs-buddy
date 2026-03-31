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
})
