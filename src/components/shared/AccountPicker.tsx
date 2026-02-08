import { useState, useEffect, useCallback } from 'react'
import { User } from 'lucide-react'
import { useCopilotSettings, useGitHubAccounts } from '../../hooks/useConfig'
import { InlineDropdown } from '../InlineDropdown'
import type { DropdownOption } from '../InlineDropdown'

export interface AccountPickerProps {
  /** Currently selected account (empty = use active CLI account) */
  value: string
  /** Called when account changes */
  onChange: (account: string) => void
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
}

/**
 * Reusable GitHub account picker.
 * Supports two display variants:
 * - `inline` (default): compact InlineDropdown style (used in prompt boxes, job editors)
 * - `select`: standard <select> element (used in settings pages)
 */
export function AccountPicker({
  value,
  onChange,
  persist = false,
  disabled = false,
  title = 'GitHub account',
  className = '',
  variant = 'inline',
  align = 'left',
}: AccountPickerProps) {
  const { setGhAccount } = useCopilotSettings()
  const { accounts: githubAccounts } = useGitHubAccounts()
  const [activeCliAccount, setActiveCliAccount] = useState<string | null>(null)

  // Detect currently active gh CLI account
  useEffect(() => {
    window.ipcRenderer.invoke('github:get-active-account')
      .then((account: string | null) => setActiveCliAccount(account))
      .catch(() => {})
  }, [])

  const uniqueAccounts = [...new Set(githubAccounts.map(a => a.username))]

  const handleChange = useCallback(async (newValue: string) => {
    onChange(newValue)
    if (persist) {
      setGhAccount(newValue).catch(() => {})
    }
    // Re-detect active CLI account when cleared
    if (!newValue) {
      window.ipcRenderer.invoke('github:get-active-account')
        .then((account: string | null) => setActiveCliAccount(account))
        .catch(() => {})
    }
  }, [onChange, persist, setGhAccount])

  if (variant === 'select') {
    return (
      <div className={`select-control ${className}`}>
        <select
          value={value}
          onChange={e => handleChange(e.target.value)}
          className="settings-select"
          disabled={disabled}
        >
          <option value="">
            Use active CLI account{activeCliAccount ? ` (${activeCliAccount})` : ''}
          </option>
          {uniqueAccounts.map(username => (
            <option key={username} value={username}>
              {username}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Inline variant
  const accountOptions: DropdownOption[] = [
    { value: '', label: 'Default' },
    ...uniqueAccounts.map(u => ({ value: u, label: u })),
  ]

  return (
    <InlineDropdown
      value={value}
      options={accountOptions}
      onChange={handleChange}
      icon={<User size={11} />}
      placeholder="Default"
      disabled={disabled}
      title={title}
      className={className}
      align={align}
    />
  )
}
