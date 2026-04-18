import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepoContextFromViewId, type RepoContext } from '../utils/repoContext'
import { killTerminalSession, getSessionId } from '../components/terminal/terminalSessions'
import { useSettings, useSettingsMutations } from './useConvex'

const PANEL_HEIGHT_SAVE_DEBOUNCE_MS = 300
const DEFAULT_TERMINAL_PANEL_HEIGHT = 300
const MIN_PANEL_HEIGHT = 100
const MAX_PANEL_HEIGHT = 1200

function clampPanelHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_PANEL_HEIGHT
  return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, value))
}

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
  panelHeight: number
  onPanelResize: (sizes: number[]) => void
  loaded: boolean
}

let nextTabNumber = 1

export function useTerminalPanel(activeViewId?: string | null): UseTerminalPanelReturn {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([])
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_TERMINAL_PANEL_HEIGHT)
  const [loaded, setLoaded] = useState(false)
  const heightSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const terminalTabsRef = useRef(terminalTabs)
  terminalTabsRef.current = terminalTabs
  const terminalOpenRef = useRef(terminalOpen)
  terminalOpenRef.current = terminalOpen
  const activeViewIdRef = useRef(activeViewId)
  activeViewIdRef.current = activeViewId

  // Convex persistence
  const settings = useSettings()
  const { updateTerminalPanelHeight } = useSettingsMutations()

  // Load persisted state on mount (local IPC is fast/immediate)
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      window.ipcRenderer.invoke('config:get-terminal-open') as Promise<boolean>,
      window.ipcRenderer.invoke('config:get-terminal-panel-height') as Promise<number>,
    ]).then(([openResult, heightResult]) => {
      if (cancelled) return
      if (openResult.status === 'fulfilled' && typeof openResult.value === 'boolean') {
        setTerminalOpen(openResult.value)
      }
      if (heightResult.status === 'fulfilled' && typeof heightResult.value === 'number') {
        setPanelHeight(clampPanelHeight(heightResult.value))
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Sync from Convex when available (fills in on new machines with no local config)
  useEffect(() => {
    if (settings?.terminalPanelHeight != null && loaded) {
      // Only apply Convex value if local didn't have one (first launch on new device)
      window.ipcRenderer
        .invoke('config:get-terminal-panel-height')
        .then((local: unknown) => {
          if (local == null) {
            setPanelHeight(clampPanelHeight(settings.terminalPanelHeight!))
          }
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.terminalPanelHeight, loaded])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (heightSaveTimeoutRef.current) clearTimeout(heightSaveTimeoutRef.current)
    }
  }, [])

  const addTerminalTab = useCallback(async (repoContext: RepoContext | null) => {
    let cwd: string | undefined
    let title: string
    let repoSlug: string | undefined

    if (repoContext) {
      repoSlug = `${repoContext.owner}/${repoContext.repo}`

      // Optimistic dedup via ref (avoids unnecessary IPC calls)
      const existing = terminalTabsRef.current.find(t => t.repoSlug === repoSlug)
      if (existing) {
        setActiveTerminalTabId(existing.id)
        return existing
      }

      title = repoContext.repo

      try {
        const result = await window.terminal.resolveRepoPath(repoContext.owner, repoContext.repo)
        cwd = result.path || undefined
      } catch {
        // Fall back to empty cwd if path resolution fails
      }
    } else {
      title = `Terminal ${nextTabNumber++}`
    }

    const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newTab: TerminalTab = {
      id: tabId,
      title,
      cwd: cwd || '',
      repoSlug,
    }

    // Re-check against the latest ref after async work completes so dedup/add and
    // active-tab selection are derived from the same snapshot.
    if (repoSlug) {
      const existing = terminalTabsRef.current.find(t => t.repoSlug === repoSlug)
      if (existing) {
        setActiveTerminalTabId(existing.id)
        return existing
      }
    }

    const nextTabs = [...terminalTabsRef.current, newTab]
    terminalTabsRef.current = nextTabs
    setTerminalTabs(nextTabs)

    setActiveTerminalTabId(tabId)
    return newTab
  }, [])

  const toggleTerminal = useCallback(
    (activeViewId?: string | null) => {
      const next = !terminalOpenRef.current
      terminalOpenRef.current = next
      setTerminalOpen(next)
      window.ipcRenderer.invoke('config:set-terminal-open', next).catch(() => {})

      if (next) {
        const currentTabs = terminalTabsRef.current
        // Opening — auto-create a tab if none exist
        if (currentTabs.length === 0) {
          const repoContext = activeViewId ? getRepoContextFromViewId(activeViewId) : null
          void addTerminalTab(repoContext)
        } else {
          // If we have a repo context, focus or create tab for it
          const repoContext = activeViewId ? getRepoContextFromViewId(activeViewId) : null
          if (repoContext) {
            const slug = `${repoContext.owner}/${repoContext.repo}`
            const existing = currentTabs.find(t => t.repoSlug === slug)
            if (existing) {
              setActiveTerminalTabId(existing.id)
            } else {
              void addTerminalTab(repoContext)
            }
          }
        }
      }
    },
    [addTerminalTab]
  )

  const closeTerminalTab = useCallback(
    (tabId: string) => {
      killTerminalSession(tabId)

      const prev = terminalTabsRef.current
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return

      const next = prev.filter(t => t.id !== tabId)
      terminalTabsRef.current = next

      // Functional updater composes safely with concurrent addTerminalTab updates
      setTerminalTabs(prev => prev.filter(t => t.id !== tabId))

      // Update active tab
      if (activeTerminalTabId === tabId) {
        if (next.length === 0) {
          setActiveTerminalTabId(null)
          setTerminalOpen(false)
          window.ipcRenderer.invoke('config:set-terminal-open', false).catch(() => {})
        } else {
          const newIdx = Math.min(idx, next.length - 1)
          setActiveTerminalTabId(next[newIdx].id)
        }
      }
    },
    [activeTerminalTabId]
  )

  const onPanelResize = useCallback((sizes: number[]) => {
    // sizes[0] = content height, sizes[1] = terminal panel height
    if (sizes.length >= 2 && sizes[1] > 0) {
      const clamped = clampPanelHeight(sizes[1])
      setPanelHeight(clamped)

      if (heightSaveTimeoutRef.current) clearTimeout(heightSaveTimeoutRef.current)
      heightSaveTimeoutRef.current = setTimeout(() => {
        window.ipcRenderer.invoke('config:set-terminal-panel-height', clamped).catch(() => {})
        updateTerminalPanelHeight({ height: clamped }).catch(() => {})
      }, PANEL_HEIGHT_SAVE_DEBOUNCE_MS)
    }
  }, [updateTerminalPanelHeight])

  // Keyboard shortcut: Ctrl+`
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === '`') {
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

  const renameTerminalTab = useCallback((tabId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setTerminalTabs(prev => {
      const tab = prev.find(t => t.id === tabId)
      if (!tab || tab.title === trimmed) return prev
      const next = prev.map(t => (t.id === tabId ? { ...t, title: trimmed } : t))
      terminalTabsRef.current = next
      return next
    })
  }, [])

  const setTerminalTabColor = useCallback((tabId: string, color: string | undefined) => {
    setTerminalTabs(prev => {
      const next = prev.map(t => (t.id === tabId ? { ...t, color } : t))
      terminalTabsRef.current = next
      return next
    })
  }, [])

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
    panelHeight,
    onPanelResize,
    loaded,
  }
}
