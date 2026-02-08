import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import './InlineDropdown.css'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
  hint?: string
}

interface InlineDropdownProps {
  /** Currently selected value */
  value: string
  /** Available options */
  options: DropdownOption[]
  /** Called when selection changes */
  onChange: (value: string) => void
  /** Optional icon to show before the label */
  icon?: React.ReactNode
  /** Placeholder when no value selected */
  placeholder?: string
  /** Disable the dropdown */
  disabled?: boolean
  /** Tooltip on hover */
  title?: string
  /** Additional CSS class */
  className?: string
  /** Menu alignment */
  align?: 'left' | 'right'
  /** Opens dropdown upward */
  openUpward?: boolean
}

export function InlineDropdown({
  value,
  options,
  onChange,
  icon,
  placeholder = 'Select...',
  disabled = false,
  title,
  className = '',
  align = 'left',
  openUpward = false,
}: InlineDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusIndex >= 0 && menuRef.current) {
      const items = menuRef.current.querySelectorAll('.idropdown-item')
      items[focusIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusIndex, isOpen])

  const enabledOptions = options.filter(o => !o.disabled)

  const handleToggle = useCallback(() => {
    if (disabled) return
    setIsOpen(prev => {
      if (!prev) {
        // Opening — set focus to current value
        const idx = enabledOptions.findIndex(o => o.value === value)
        setFocusIndex(idx >= 0 ? idx : 0)
      }
      return !prev
    })
  }, [disabled, enabledOptions, value])

  const handleSelect = useCallback((optValue: string) => {
    onChange(optValue)
    setIsOpen(false)
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (isOpen && focusIndex >= 0 && focusIndex < enabledOptions.length) {
          handleSelect(enabledOptions[focusIndex].value)
        } else {
          handleToggle()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          handleToggle()
        } else {
          setFocusIndex(prev => Math.min(prev + 1, enabledOptions.length - 1))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) {
          setFocusIndex(prev => Math.max(prev - 1, 0))
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }, [disabled, isOpen, focusIndex, enabledOptions, handleSelect, handleToggle])

  return (
    <div
      ref={containerRef}
      className={`idropdown ${isOpen ? 'idropdown-open' : ''} ${disabled ? 'idropdown-disabled' : ''} ${className}`}
      title={title}
      tabIndex={disabled ? -1 : 0}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="idropdown-trigger"
        onClick={handleToggle}
        disabled={disabled}
        tabIndex={-1}
      >
        {icon && <span className="idropdown-icon">{icon}</span>}
        <span className="idropdown-label">{displayLabel}</span>
        <ChevronDown size={10} className={`idropdown-chevron ${isOpen ? 'idropdown-chevron-open' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`idropdown-menu ${align === 'right' ? 'idropdown-menu-right' : ''} ${openUpward ? 'idropdown-menu-up' : ''}`}
          role="listbox"
        >
          {options.map((opt) => {
            const enabledIdx = enabledOptions.indexOf(opt)
            return (
              <div
                key={opt.value}
                className={`idropdown-item ${opt.value === value ? 'idropdown-item-selected' : ''} ${opt.disabled ? 'idropdown-item-disabled' : ''} ${enabledIdx === focusIndex ? 'idropdown-item-focused' : ''}`}
                role="option"
                aria-selected={opt.value === value}
                aria-disabled={opt.disabled}
                onClick={() => {
                  if (!opt.disabled) handleSelect(opt.value)
                }}
                onMouseEnter={() => {
                  if (!opt.disabled) setFocusIndex(enabledIdx)
                }}
              >
                <span className="idropdown-item-check">
                  {opt.value === value && <Check size={12} />}
                </span>
                <span className="idropdown-item-label">{opt.label}</span>
                {opt.hint && <span className="idropdown-item-hint">{opt.hint}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
