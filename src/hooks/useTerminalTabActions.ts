import { useCallback, type MutableRefObject } from 'react'
import type { TerminalTab } from './useTerminalPanel'

interface UseTerminalTabActionsOptions {
  terminalTabsRef: MutableRefObject<TerminalTab[]>
  setTerminalTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>
}

/**
 * Provides tab-mutation callbacks (rename, color, reorder, updateCwd)
 * extracted from useTerminalPanel to reduce function length.
 */
export function useTerminalTabActions({
  terminalTabsRef,
  setTerminalTabs,
}: UseTerminalTabActionsOptions) {
  /** Apply a transform to the tabs array, syncing ref + state in one place. */
  const applyTabsUpdate = useCallback(
    (transform: (tabs: TerminalTab[]) => TerminalTab[] | null) => {
      setTerminalTabs(prev => {
        const next = transform(prev)
        if (!next) return prev
        terminalTabsRef.current = next
        return next
      })
    },
    [setTerminalTabs, terminalTabsRef]
  )

  const renameTerminalTab = useCallback(
    (tabId: string, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      applyTabsUpdate(prev => {
        const tab = prev.find(t => t.id === tabId)
        if (!tab || tab.title === trimmed) return null
        return prev.map(t => (t.id === tabId ? { ...t, title: trimmed } : t))
      })
    },
    [applyTabsUpdate]
  )

  const setTerminalTabColor = useCallback(
    (tabId: string, color: string | undefined) => {
      applyTabsUpdate(prev => prev.map(t => (t.id === tabId ? { ...t, color } : t)))
    },
    [applyTabsUpdate]
  )

  const reorderTerminalTabs = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      applyTabsUpdate(prev => {
        const fromIdx = prev.findIndex(t => t.id === fromId)
        const toIdx = prev.findIndex(t => t.id === toId)
        if (fromIdx === -1 || toIdx === -1) return null
        const next = [...prev]
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        return next
      })
    },
    [applyTabsUpdate]
  )

  const updateTabCwd = useCallback(
    (tabId: string, cwd: string) => {
      applyTabsUpdate(prev => {
        const tab = prev.find(t => t.id === tabId)
        if (!tab || tab.cwd === cwd) return null
        return prev.map(t => (t.id === tabId ? { ...t, cwd } : t))
      })
    },
    [applyTabsUpdate]
  )

  return {
    renameTerminalTab,
    setTerminalTabColor,
    reorderTerminalTabs,
    updateTabCwd,
  }
}
