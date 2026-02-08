import { useState, useEffect, useCallback, useRef } from 'react'
import { Cpu, Loader2, RefreshCw } from 'lucide-react'
import { useCopilotSettings } from '../../hooks/useConfig'
import { InlineDropdown } from '../InlineDropdown'
import type { DropdownOption } from '../InlineDropdown'

/** Model info returned from the Copilot SDK */
export interface SdkModel {
  id: string
  name: string
  isDisabled: boolean
  billingMultiplier: number
}

export interface ModelPickerProps {
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
}

/**
 * Reusable Copilot model picker.
 * Fetches available models from the Copilot SDK and renders them.
 * Supports two display variants:
 * - `inline` (default): compact InlineDropdown style
 * - `select`: standard <select> element
 */
export function ModelPicker({
  value,
  onChange,
  ghAccount = '',
  persist = false,
  disabled = false,
  title = 'Copilot model',
  className = '',
  variant = 'inline',
  align = 'left',
  showRefresh = false,
}: ModelPickerProps) {
  const { setModel: persistModel } = useCopilotSettings()
  const [sdkModels, setSdkModels] = useState<SdkModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const fetchModels = useCallback(async (forAccount?: string) => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const result = await window.copilot.listModels(forAccount || undefined)
      if (result && 'error' in result) {
        setModelsError(result.error as string)
        setSdkModels([])
      } else if (Array.isArray(result)) {
        setSdkModels(result)
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err))
      setSdkModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [])

  // Fetch models on mount and when account changes
  const lastAccountRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (lastAccountRef.current !== ghAccount) {
      lastAccountRef.current = ghAccount
      fetchModels(ghAccount || undefined)
    }
  }, [ghAccount, fetchModels])

  // Initial fetch
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      fetchModels(ghAccount || undefined)
    }
  }, [fetchModels, ghAccount])

  // Validate selected model when models list refreshes
  useEffect(() => {
    if (sdkModels.length > 0) {
      const isKnown = sdkModels.some(m => m.id === value)
      if (!isKnown && value !== '') {
        const firstEnabled = sdkModels.find(m => !m.isDisabled)
        if (firstEnabled) {
          onChange(firstEnabled.id)
          if (persist) {
            persistModel(firstEnabled.id).catch(() => {})
          }
        }
      }
    }
  }, [sdkModels, value, onChange, persist, persistModel])

  const handleChange = useCallback(async (newValue: string) => {
    onChange(newValue)
    if (persist) {
      await persistModel(newValue)
    }
  }, [onChange, persist, persistModel])

  const enabledModels = sdkModels.filter(m => !m.isDisabled)
  const disabledModels = sdkModels.filter(m => m.isDisabled)

  /** Format billing multiplier */
  const billingLabel = (multiplier: number) => {
    if (multiplier <= 1) return ''
    return ` · ${multiplier}x`
  }

  // Loading state
  if (modelsLoading && variant === 'inline') {
    return (
      <div className={`copilot-model-loading ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <Loader2 size={11} className="spin" /> Loading...
      </div>
    )
  }

  if (variant === 'select') {
    return (
      <div className={className}>
        {modelsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Loader2 size={16} className="spin" />
            Fetching available models...
          </div>
        ) : modelsError ? (
          <div className="form-error" style={{ marginBottom: '8px' }}>
            Failed to fetch models: {modelsError}
          </div>
        ) : sdkModels.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
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
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="select-control" style={{ flex: 1 }}>
              <select
                value={value}
                onChange={e => handleChange(e.target.value)}
                className="settings-select"
                disabled={disabled}
              >
                {enabledModels.length > 0 && (
                  <optgroup label="Available Models">
                    {enabledModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{billingLabel(m.billingMultiplier)}
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
            {showRefresh && (
              <button
                className="settings-btn settings-btn-secondary"
                onClick={() => fetchModels(ghAccount || undefined)}
                disabled={modelsLoading}
                title="Refresh models from Copilot SDK"
                style={{ padding: '6px 10px' }}
              >
                {modelsLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Inline variant
  const modelOptions: DropdownOption[] = enabledModels.length > 0
    ? enabledModels.map(m => ({
        value: m.id,
        label: m.name,
        hint: m.billingMultiplier > 1 ? `${m.billingMultiplier}x` : undefined,
      }))
    : [{ value: value, label: value }]

  return (
    <InlineDropdown
      value={value}
      options={modelOptions}
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
