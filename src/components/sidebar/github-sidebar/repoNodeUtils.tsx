export function handleItemKeyDown(
  event: React.KeyboardEvent,
  action: () => void,
  stopPropagation = false
) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  if (stopPropagation) {
    event.stopPropagation()
  }
  action()
}

export function sidebarItemClass(baseClass: string, isSelected: boolean): string {
  if (isSelected) return `${baseClass} selected`
  return baseClass
}

const REFRESH_STATE_CLASSES: Record<string, string> = {
  active: 'refresh-active',
  pending: 'refresh-pending',
}

export function refreshStateClass(state: string | undefined): string {
  return (state && REFRESH_STATE_CLASSES[state]) ?? ''
}
