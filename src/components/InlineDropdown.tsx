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
  /** Accessible label for the combobox */
  'aria-label'?: string
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

interface DropdownKeyContext {
  e: React.KeyboardEvent
  disabled: boolean
  isOpen: boolean
  focusIndex: number
  enabledOptions: DropdownOption[]
  handleSelect: (v: string) => void
  handleToggle: () => void
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

function handleEnterOrSpaceKey(ctx: DropdownKeyContext): void {
  ctx.e.preventDefault()
  handleEnterOrSpace(
    ctx.isOpen,
    ctx.focusIndex,
    ctx.enabledOptions,
    ctx.handleSelect,
    ctx.handleToggle
  )
}

function handleArrowDownKey(ctx: DropdownKeyContext): void {
  ctx.e.preventDefault()
  if (!ctx.isOpen) {
    ctx.handleToggle()
  } else {
    ctx.setFocusIndex(prev => Math.min(prev + 1, ctx.enabledOptions.length - 1))
  }
}

function handleArrowUpKey(ctx: DropdownKeyContext): void {
  ctx.e.preventDefault()
  if (ctx.isOpen) {
    ctx.setFocusIndex(prev => Math.max(prev - 1, 0))
  }
}

function handleEscapeKey(ctx: DropdownKeyContext): void {
  ctx.e.preventDefault()
  ctx.setIsOpen(false)
}

const dropdownKeyHandlers: Record<string, (ctx: DropdownKeyContext) => void> = {
  Enter: handleEnterOrSpaceKey,
  ' ': handleEnterOrSpaceKey,
  ArrowDown: handleArrowDownKey,
  ArrowUp: handleArrowUpKey,
  Escape: handleEscapeKey,
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

  const handler = dropdownKeyHandlers[e.key]
  if (handler)
    handler({
      e,
      disabled,
      isOpen,
      focusIndex,
      enabledOptions,
      handleSelect,
      handleToggle,
      setFocusIndex,
      setIsOpen,
    })
}

function resolveEnabledIndex(enabledIndexMap: Map<string, number>, value: string): number {
  return enabledIndexMap.get(value) ?? -1
}

function handleMenuItemFocus(
  isDisabled: boolean | undefined,
  enabledIdx: number,
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
): void {
  if (!isDisabled && enabledIdx >= 0) setFocusIndex(enabledIdx)
}

function handleMenuItemKeyDown(
  e: React.KeyboardEvent,
  isDisabled: boolean | undefined,
  optValue: string,
  handleSelect: (v: string) => void
): void {
  if (isDisabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    handleSelect(optValue)
  }
}

function handleMenuItemClick(
  isDisabled: boolean | undefined,
  optValue: string,
  handleSelect: (v: string) => void
): void {
  if (!isDisabled) handleSelect(optValue)
}

function DropdownMenuCheck({ isSelected }: { isSelected: boolean }) {
  return <span className="idropdown-item-check">{isSelected && <Check size={12} />}</span>
}

function DropdownMenuHint({ hint }: { hint?: string }) {
  if (!hint) return null
  return <span className="idropdown-item-hint">{hint}</span>
}

function DropdownMenuItem({
  opt,
  enabledIdx,
  value,
  focusIndex,
  handleSelect,
  setFocusIndex,
}: {
  opt: DropdownOption
  enabledIdx: number
  value: string
  focusIndex: number
  handleSelect: (v: string) => void
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
}) {
  const isFocused = enabledIdx >= 0 && enabledIdx === focusIndex
  const isSelected = opt.value === value

  return (
    <div
      className={buildItemClassName(opt.value, value, opt.disabled, isFocused)}
      role="option"
      aria-selected={isSelected}
      aria-disabled={opt.disabled}
      tabIndex={resolveItemTabIndex(opt.disabled, isFocused)}
      onClick={() => handleMenuItemClick(opt.disabled, opt.value, handleSelect)}
      onKeyDown={e => handleMenuItemKeyDown(e, opt.disabled, opt.value, handleSelect)}
      onMouseEnter={() => handleMenuItemFocus(opt.disabled, enabledIdx, setFocusIndex)}
      onFocus={() => handleMenuItemFocus(opt.disabled, enabledIdx, setFocusIndex)}
    >
      <DropdownMenuCheck isSelected={isSelected} />
      <span className="idropdown-item-label">{opt.label}</span>
      <DropdownMenuHint hint={opt.hint} />
    </div>
  )
}

function renderDropdownMenuItem(
  opt: DropdownOption,
  enabledIndexMap: Map<string, number>,
  value: string,
  focusIndex: number,
  handleSelect: (v: string) => void,
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
) {
  return (
    <DropdownMenuItem
      key={opt.value}
      opt={opt}
      enabledIdx={resolveEnabledIndex(enabledIndexMap, opt.value)}
      value={value}
      focusIndex={focusIndex}
      handleSelect={handleSelect}
      setFocusIndex={setFocusIndex}
    />
  )
}

function getDropdownMenuClassName(align: 'left' | 'right', openUpward: boolean): string {
  return `idropdown-menu ${align === 'right' ? 'idropdown-menu-right' : ''} ${openUpward ? 'idropdown-menu-up' : ''}`
}

function DropdownMenuItems({
  options,
  enabledIndexMap,
  value,
  focusIndex,
  handleSelect,
  setFocusIndex,
}: {
  options: DropdownOption[]
  enabledIndexMap: Map<string, number>
  value: string
  focusIndex: number
  handleSelect: (v: string) => void
  setFocusIndex: React.Dispatch<React.SetStateAction<number>>
}) {
  return options.map(opt =>
    renderDropdownMenuItem(opt, enabledIndexMap, value, focusIndex, handleSelect, setFocusIndex)
  )
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
      className={getDropdownMenuClassName(align, openUpward)}
      role="listbox"
    >
      <DropdownMenuItems
        options={options}
        enabledIndexMap={enabledIndexMap}
        value={value}
        focusIndex={focusIndex}
        handleSelect={handleSelect}
        setFocusIndex={setFocusIndex}
      />
    </div>
  )
}

function buildItemClassName(
  optValue: string,
  selectedValue: string,
  isDisabled: boolean | undefined,
  isFocused: boolean
) {
  return `idropdown-item ${optValue === selectedValue ? 'idropdown-item-selected' : ''} ${isDisabled ? 'idropdown-item-disabled' : ''} ${isFocused ? 'idropdown-item-focused' : ''}`
}

function resolveItemTabIndex(isDisabled: boolean | undefined, isFocused: boolean): number {
  if (isDisabled) return -1
  return isFocused ? 0 : -1
}

function resolveContainerClassName(isOpen: boolean, disabled: boolean, className: string): string {
  return `idropdown ${isOpen ? 'idropdown-open' : ''} ${disabled ? 'idropdown-disabled' : ''} ${className}`
}

function resolveChevronClassName(isOpen: boolean): string {
  return `idropdown-chevron ${isOpen ? 'idropdown-chevron-open' : ''}`
}

function resolveContainerAttrs(
  isOpen: boolean,
  disabled: boolean,
  className: string,
  listboxId: string
) {
  return {
    className: resolveContainerClassName(isOpen, disabled, className),
    tabIndex: disabled ? -1 : 0,
    ariaControls: isOpen ? listboxId : undefined,
    chevronClassName: resolveChevronClassName(isOpen),
  }
}

function resolveProps(raw: InlineDropdownProps) {
  const placeholder = raw.placeholder ?? 'Select...'
  const disabled = raw.disabled ?? false
  const className = raw.className ?? ''
  const align = raw.align ?? ('left' as const)
  const openUpward = raw.openUpward ?? false
  return {
    ...raw,
    placeholder,
    disabled,
    className,
    align,
    openUpward,
  }
}

function resolveDisplayLabel(options: DropdownOption[], value: string, placeholder: string): string {
  return options.find(o => o.value === value)?.label ?? placeholder
}

function useCloseDropdownOnOutsideClick(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [containerRef, isOpen, setIsOpen])
}

function useScrollFocusedDropdownItemIntoView(
  isOpen: boolean,
  focusIndex: number,
  menuRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (isOpen && focusIndex >= 0 && menuRef.current) {
      const items = menuRef.current.querySelectorAll('.idropdown-item')
      items[focusIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusIndex, isOpen, menuRef])
}

function DropdownTrigger({
  icon,
  displayLabel,
  disabled,
  chevronClassName,
  onToggle,
}: {
  icon?: React.ReactNode
  displayLabel: string
  disabled: boolean
  chevronClassName: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="idropdown-trigger"
      onClick={onToggle}
      disabled={disabled}
      tabIndex={-1}
    >
      {icon && <span className="idropdown-icon">{icon}</span>}
      <span className="idropdown-label">{displayLabel}</span>
      <ChevronDown size={10} className={chevronClassName} />
    </button>
  )
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
    'aria-label': ariaLabel,
  } = resolveProps(rawProps)
  const [isOpen, setIsOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const displayLabel = resolveDisplayLabel(options, value, placeholder)

  useCloseDropdownOnOutsideClick(isOpen, containerRef, setIsOpen)
  useScrollFocusedDropdownItemIntoView(isOpen, focusIndex, menuRef)

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

  const attrs = resolveContainerAttrs(isOpen, disabled, className, listboxId)

  return (
    <div
      ref={containerRef}
      className={attrs.className}
      title={title}
      tabIndex={attrs.tabIndex}
      role="combobox"
      aria-label={ariaLabel ?? title}
      aria-expanded={isOpen}
      aria-controls={attrs.ariaControls}
      onKeyDown={handleKeyDown}
    >
      <DropdownTrigger
        icon={icon}
        displayLabel={displayLabel}
        disabled={disabled}
        chevronClassName={attrs.chevronClassName}
        onToggle={handleToggle}
      />

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
