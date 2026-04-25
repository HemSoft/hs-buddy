import { useState, useEffect, useCallback, useRef } from 'react'
import { Cpu, Loader2, RefreshCw } from 'lucide-react'
import { useCopilotSettings } from '../../hooks/useConfig'
import { InlineDropdown, type DropdownOption } from '../InlineDropdown'
import { getErrorMessage } from '../../utils/errorUtils'

function applyModelResult(
  result: unknown,
  setModelsError: (e: string | null) => void,
  setSdkModels: (m: SdkModel[]) => void
) {
  if (result && 'error' in (result as Record<string, unknown>)) {
    setModelsError((result as { error: string }).error)
    setSdkModels([])
  } else if (Array.isArray(result)) {
    setSdkModels(result)
  }
}

/** Model info returned from the Copilot SDK */
interface SdkModel {
  id: string
  name: string
  isDisabled: boolean
  billingMultiplier: number
}

interface ModelPickerProps {
  /** Currently selected model ID */
  value: string
  /** Called when model changes */
  onChange: (model: string) => void
  /** GitHub account to fetch models for (empty = active CLI) */
  ghAccount?: string
  /** Whether to persist the change to Convex settings */
  persist?: boolean
  /** Disable the picker */
  disabled?: boolean
  /** Tooltip on hover */
  title?: string
  /** Additional CSS class */
  className?: string
  /** Render variant */
  variant?: 'inline' | 'select'
  /** Menu alignment for inline variant */
  align?: 'left' | 'right'
  /** Show refresh button (only for select variant) */
  showRefresh?: boolean
  /** id for the select element (select variant only) */
  id?: string
}

function useModelFetch() {
  const [sdkModels, setSdkModels] = useState<SdkModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const fetchModels = useCallback(async (forAccount?: string) => {
    const thisId = ++fetchIdRef.current
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.copilot.listModels(forAccount || undefined)
      if (fetchIdRef.current !== thisId) return
      applyModelResult(result, setModelsError, setSdkModels)
    } catch (err) {
      if (fetchIdRef.current !== thisId) return
      setModelsError(getErrorMessage(err))
      setSdkModels([])
    } finally {
      if (fetchIdRef.current === thisId) {
        setModelsLoading(false)
      }
    }
  }, [])

  const lastAccountRef = useRef<string | undefined>(undefined)

  return { sdkModels, modelsLoading, modelsError, fetchModels, lastAccountRef }
}

function billingLabel(multiplier: number): string {
  if (multiplier <= 1) return ''
  return ` · ${multiplier}x`
}

const SELECT_STATUS_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 0',
  color: 'var(--text-secondary)',
  fontSize: '13px',
} satisfies React.CSSProperties

function ModelPickerNoModels({
  showRefresh,
  fetchModels,
  ghAccount,
  className,
}: {
  showRefresh: boolean
  fetchModels: (forAccount?: string) => Promise<void>
  ghAccount: string
  className: string
}) {
  return (
    <div className={className}>
      <div style={SELECT_STATUS_STYLE}>
        No models loaded.{' '}
        {showRefresh && (
          <button
            className="settings-btn settings-btn-secondary"
            onClick={() => fetchModels(ghAccount || undefined)}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>
    </div>
  )
}

function ModelPickerRefreshButton({
  showRefresh,
  fetchModels,
  ghAccount,
  modelsLoading,
}: {
  showRefresh: boolean
  fetchModels: (forAccount?: string) => Promise<void>
  ghAccount: string
  modelsLoading: boolean
}) {
  if (!showRefresh) return null
  return (
    <button
      className="settings-btn settings-btn-secondary"
      onClick={() => fetchModels(ghAccount || undefined)}
      disabled={modelsLoading}
      title="Refresh models from Copilot SDK"
      style={{ padding: '6px 10px' }}
    >
      {/* v8 ignore start */}
      {modelsLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
      {/* v8 ignore stop */}
      Refresh
    </button>
  )
}

function ModelPickerSelectVariant({
  value,
  enabledModels,
  disabledModels,
  disabled,
  modelsLoading,
  showRefresh,
  modelsError,
  fetchModels,
  ghAccount,
  handleChange,
  className,
  id,
}: {
  value: string
  enabledModels: SdkModel[]
  disabledModels: SdkModel[]
  disabled: boolean
  modelsLoading: boolean
  showRefresh: boolean
  modelsError: string | null
  fetchModels: (forAccount?: string) => Promise<void>
  ghAccount: string
  handleChange: (v: string) => void
  className: string
  id?: string
}) {
  if (modelsLoading) {
    return (
      <div className={className}>
        <div style={SELECT_STATUS_STYLE}>
          <Loader2 size={16} className="spin" />
          Fetching available models...
        </div>
      </div>
    )
  }

  if (modelsError) {
    return (
      <div className={className}>
        <div className="form-error" style={{ marginBottom: '8px' }}>
          Failed to fetch models: {modelsError}
        </div>
      </div>
    )
  }

  if (enabledModels.length === 0 && disabledModels.length === 0) {
    return (
      <ModelPickerNoModels
        showRefresh={showRefresh}
        fetchModels={fetchModels}
        ghAccount={ghAccount}
        className={className}
      />
    )
  }

  return (
    <div className={className}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="select-control" style={{ flex: 1 }}>
          <select
            id={id}
            value={value}
            onChange={e => handleChange(e.target.value)}
            className="settings-select"
            disabled={disabled}
          >
            {enabledModels.length > 0 && (
              <optgroup label="Available Models">
                {enabledModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {billingLabel(m.billingMultiplier)}
                  </option>
                ))}
              </optgroup>
            )}
            {disabledModels.length > 0 && (
              <optgroup label="Disabled by Policy">
                {disabledModels.map(m => (
                  <option key={m.id} value={m.id} disabled>
                    {m.name} (disabled)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <ModelPickerRefreshButton
          showRefresh={showRefresh}
          fetchModels={fetchModels}
          ghAccount={ghAccount}
          modelsLoading={modelsLoading}
        />
      </div>
    </div>
  )
}

function useModelValidation(
  sdkModels: { id: string; isDisabled?: boolean }[],
  value: string,
  onChange: (v: string) => void,
  persist: boolean,
  persistModel: (v: string) => Promise<void>
) {
  useEffect(() => {
    if (sdkModels.length === 0) return
    const isKnown = sdkModels.some(m => m.id === value)
    if (isKnown || value === '') return
    const firstEnabled = sdkModels.find(m => !m.isDisabled)
    if (!firstEnabled) return
    onChange(firstEnabled.id)
    if (persist) {
      /* v8 ignore start */
      persistModel(firstEnabled.id).catch(() => {})
      /* v8 ignore stop */
    }
  }, [sdkModels, value, onChange, persist, persistModel])
}

function buildModelOptions(enabledModels: SdkModel[], currentValue: string): DropdownOption[] {
  return enabledModels.length > 0
    ? enabledModels.map(m => ({
        value: m.id,
        label: m.name,
        hint: m.billingMultiplier > 1 ? `${m.billingMultiplier}x` : undefined,
      }))
    : [{ value: currentValue, label: currentValue }]
}

/**
 * Reusable Copilot model picker.
 * Fetches available models from the Copilot SDK and renders them.
 * Supports two display variants:
 * - `inline` (default): compact InlineDropdown style
 * - `select`: standard <select> element
 */
function useModelPickerSetup(
  ghAccount: string,
  value: string,
  onChange: (model: string) => void,
  persist: boolean
) {
  const { setModel: persistModel } = useCopilotSettings()
  const { sdkModels, modelsLoading, modelsError, fetchModels, lastAccountRef } = useModelFetch()

  useEffect(() => {
    /* v8 ignore start */
    if (lastAccountRef.current !== ghAccount) {
      /* v8 ignore stop */
      lastAccountRef.current = ghAccount
      fetchModels(ghAccount || undefined)
    }
  }, [ghAccount, fetchModels, lastAccountRef])

  useModelValidation(sdkModels, value, onChange, persist, persistModel)

  const handleChange = useCallback(
    async (newValue: string) => {
      onChange(newValue)
      if (persist) {
        await persistModel(newValue)
      }
    },
    [onChange, persist, persistModel]
  )

  const enabledModels = sdkModels.filter(m => !m.isDisabled)
  const disabledModels = sdkModels.filter(m => m.isDisabled)

  return {
    sdkModels,
    modelsLoading,
    modelsError,
    fetchModels,
    handleChange,
    enabledModels,
    disabledModels,
  }
}

const MODEL_PICKER_DEFAULTS = {
  ghAccount: '',
  persist: false,
  disabled: false,
  title: 'Copilot model',
  className: '',
  variant: 'inline' as const,
  align: 'left' as const,
  showRefresh: false,
}

export function ModelPicker(props: ModelPickerProps) {
  const {
    value,
    onChange,
    ghAccount,
    persist,
    disabled,
    title,
    className,
    variant,
    align,
    showRefresh,
    id,
  } = {
    ...MODEL_PICKER_DEFAULTS,
    ...props,
  }
  const { modelsLoading, modelsError, fetchModels, handleChange, enabledModels, disabledModels } =
    useModelPickerSetup(ghAccount, value, onChange, persist)

  if (modelsLoading && variant === 'inline') {
    return (
      <div
        className={`copilot-model-loading ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}
      >
        <Loader2 size={11} className="spin" /> Loading...
      </div>
    )
  }

  if (variant === 'select') {
    return (
      <ModelPickerSelectVariant
        value={value}
        enabledModels={enabledModels}
        disabledModels={disabledModels}
        disabled={disabled}
        modelsLoading={modelsLoading}
        showRefresh={showRefresh}
        modelsError={modelsError}
        fetchModels={fetchModels}
        ghAccount={ghAccount}
        handleChange={handleChange}
        className={className}
        id={id}
      />
    )
  }

  return (
    <InlineDropdown
      value={value}
      options={buildModelOptions(enabledModels, value)}
      onChange={handleChange}
      icon={<Cpu size={11} />}
      placeholder="Select model"
      disabled={disabled}
      title={title}
      className={`copilot-model-dropdown ${className}`}
      align={align}
    />
  )
}
