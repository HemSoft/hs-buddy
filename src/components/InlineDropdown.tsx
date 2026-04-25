import { useState, useRef, useEffect, useCallback, useId, useMemo } from 'react'
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

function handleEnterOrSpace(
  isOpen: boolean,
  focusIndex: number,
  enabledOptions: DropdownOption[],
  handleSelect: (v: string) => void,
  handleToggle: () => void
): void {
  if (isOpen && focusIndex >= 0 && focusIndex < enabledOptions.length) {
    handleSelect(enabledOptions[focusIndex].value)
  } else {
    handleToggle()
  }
}

function handleDropdownKeyDown(
  e: React.KeyboardEvent,
  {
    disabled,
    isOpen,
    focusIndex,
    enabledOptions,
    handleSelect,
    handleToggle,
    setFocusIndex,
    setIsOpen,
  }: {
    disabled: boolean
    isOpen: boolean
    focusIndex: number
    enabledOptions: DropdownOption[]
    handleSelect: (v: string) => void
    handleToggle: () => void
    setFocusIndex: React.Dispatch<React.SetStateAction<number>>
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  }
): void {
  if (disabled) return

  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault()
      handleEnterOrSpace(isOpen, focusIndex, enabledOptions, handleSelect, handleToggle)
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
}

function DropdownMenu({
  menuRef,
  listboxId,
  options,
  enabledOptions,
  value,
  focusIndex,
  align,
  openUpward,
  handleSelect,
  setFocusIndex,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>
  listboxId: string
  options: DropdownOption[]
  enabledOptions: DropdownOption[]
  value: string
  focusIndex: number
  align: 'left' | 'right'
  openUpward: boolean
  handleSelect: (v: string) => void
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
}) {
  const enabledIndexMap = useMemo(
    () => new Map(enabledOptions.map((opt, i) => [opt.value, i])),
    [enabledOptions]
  )

  return (
    <div
      ref={menuRef}
      id={listboxId}
      className={`idropdown-menu ${align === 'right' ? 'idropdown-menu-right' : ''} ${openUpward ? 'idropdown-menu-up' : ''}`}
      role="listbox"
    >
      {options.map(opt => {
        const enabledIdx = enabledIndexMap.get(opt.value) ?? -1
        const isFocused = enabledIdx >= 0 && enabledIdx === focusIndex
        return (
          <div
            key={opt.value}
            className={`idropdown-item ${opt.value === value ? 'idropdown-item-selected' : ''} ${opt.disabled ? 'idropdown-item-disabled' : ''} ${isFocused ? 'idropdown-item-focused' : ''}`}
            role="option"
            aria-selected={opt.value === value}
            aria-disabled={opt.disabled}
            tabIndex={opt.disabled ? -1 : isFocused ? 0 : -1}
            onClick={() => {
              if (!opt.disabled) handleSelect(opt.value)
            }}
            onKeyDown={e => {
              if (opt.disabled) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelect(opt.value)
              }
            }}
            onMouseEnter={() => {
              if (!opt.disabled && enabledIdx >= 0) setFocusIndex(enabledIdx)
            }}
            onFocus={() => {
              if (!opt.disabled && enabledIdx >= 0) setFocusIndex(enabledIdx)
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
  )
}

function resolveProps(raw: InlineDropdownProps) {
  return {
    ...raw,
    placeholder: raw.placeholder ?? 'Select...',
    disabled: raw.disabled ?? false,
    className: raw.className ?? '',
    align: raw.align ?? ('left' as const),
    openUpward: raw.openUpward ?? false,
  }
}

export function InlineDropdown(rawProps: InlineDropdownProps) {
  const {
    value,
    options,
    onChange,
    icon,
    placeholder,
    disabled,
    title,
    className,
    align,
    openUpward,
  } = resolveProps(rawProps)
  const [isOpen, setIsOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

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
    /* v8 ignore start -- button's disabled HTML attr prevents onClick from firing */
    if (disabled) return
    /* v8 ignore stop */
    setIsOpen(prev => {
      if (!prev) {
        // Opening — set focus to current value
        const idx = enabledOptions.findIndex(o => o.value === value)
        setFocusIndex(idx >= 0 ? idx : 0)
      }
      return !prev
    })
  }, [disabled, enabledOptions, value])

  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue)
      setIsOpen(false)
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleDropdownKeyDown(e, {
        disabled,
        isOpen,
        focusIndex,
        enabledOptions,
        handleSelect,
        handleToggle,
        setFocusIndex,
        setIsOpen,
      })
    },
    [disabled, isOpen, focusIndex, enabledOptions, handleSelect, handleToggle]
  )

  return (
    <div
      ref={containerRef}
      className={`idropdown ${isOpen ? 'idropdown-open' : ''} ${disabled ? 'idropdown-disabled' : ''} ${className}`}
      title={title}
      tabIndex={disabled ? -1 : 0}
      role="combobox"
      aria-expanded={isOpen}
      aria-controls={isOpen ? listboxId : undefined}
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
        <ChevronDown
          size={10}
          className={`idropdown-chevron ${isOpen ? 'idropdown-chevron-open' : ''}`}
        />
      </button>

      {isOpen && (
        <DropdownMenu
          menuRef={menuRef}
          listboxId={listboxId}
          options={options}
          enabledOptions={enabledOptions}
          value={value}
          focusIndex={focusIndex}
          align={align}
          openUpward={openUpward}
          handleSelect={handleSelect}
          setFocusIndex={setFocusIndex}
        />
      )}
    </div>
  )
}
