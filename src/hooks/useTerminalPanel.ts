import { useCallback, useEffect, useRef, useState } from 'react'
import { type RepoContext } from '../utils/repoContext'
import { killTerminalSession, getSessionId } from '../components/terminal/terminalSessions'
import { isModKey } from '../utils/platform'
import { useTerminalPersistence, DEFAULT_TERMINAL_PANEL_HEIGHT } from './useTerminalPersistence'
import { useTerminalTabActions } from './useTerminalTabActions'
import { useTerminalTabLifecycle } from './useTerminalTabLifecycle'

export interface TerminalTab {
  id: string
  title: string
  cwd: string
  /** Owner/repo slug if opened from a repo context */
  repoSlug?: string
  /** Custom tab color (CSS color value) */
  color?: string
}

interface UseTerminalPanelReturn {
  terminalOpen: boolean
  terminalTabs: TerminalTab[]
  activeTerminalTabId: string | null
  toggleTerminal: (activeViewId?: string | null) => void
  addTerminalTab: (repoContext: RepoContext | null) => Promise<TerminalTab | undefined>
  closeTerminalTab: (tabId: string) => void
  selectTerminalTab: (tabId: string) => void
  renameTerminalTab: (tabId: string, title: string) => void
  setTerminalTabColor: (tabId: string, color: string | undefined) => void
  reorderTerminalTabs: (fromId: string, toId: string) => void
  updateTabCwd: (tabId: string, cwd: string) => void
  panelHeight: number
  onPanelResize: (sizes: number[]) => void
  loaded: boolean
}

export function useTerminalPanel(activeViewId?: string | null): UseTerminalPanelReturn {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_TERMINAL_PANEL_HEIGHT)
  const terminalTabsRef = useRef(terminalTabs)
  terminalTabsRef.current = terminalTabs
  const terminalOpenRef = useRef(terminalOpen)
  terminalOpenRef.current = terminalOpen
  const activeViewIdRef = useRef(activeViewId)
  activeViewIdRef.current = activeViewId

  const { loaded, onPanelResize } = useTerminalPersistence({
    terminalTabs,
    terminalTabsRef,
    setTerminalOpen,
    setTerminalTabs,
    setActiveTerminalTabId,
    setPanelHeight,
  })

  const { addTerminalTab, toggleTerminal, closeTerminalTab } = useTerminalTabLifecycle({
    terminalTabsRef,
    terminalOpenRef,
    activeTerminalTabId,
    setTerminalOpen,
    setTerminalTabs,
    setActiveTerminalTabId,
  })

  // Keyboard shortcut: Ctrl+`
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      /* v8 ignore start */
      if (isModKey(event) && event.key === '`') {
        /* v8 ignore stop */
        event.preventDefault()
        toggleTerminal(activeViewIdRef.current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleTerminal])

  // Kill all terminal sessions on unmount (app close)
  useEffect(() => {
    return () => {
      for (const tab of terminalTabsRef.current) {
        if (getSessionId(tab.id)) {
          killTerminalSession(tab.id)
        }
      }
    }
  }, [])

  const selectTerminalTab = useCallback((tabId: string) => {
    setActiveTerminalTabId(tabId)
  }, [])

  const { renameTerminalTab, setTerminalTabColor, reorderTerminalTabs, updateTabCwd } =
    useTerminalTabActions({ terminalTabsRef, setTerminalTabs })

  return {
    terminalOpen,
    terminalTabs,
    activeTerminalTabId,
    toggleTerminal,
    addTerminalTab,
    closeTerminalTab,
    selectTerminalTab,
    renameTerminalTab,
    setTerminalTabColor,
    reorderTerminalTabs,
    updateTabCwd,
    panelHeight,
    onPanelResize,
    loaded,
  }
}
