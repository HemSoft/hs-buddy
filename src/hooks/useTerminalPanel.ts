import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepoContextFromViewId, type RepoContext } from '../utils/repoContext'
import { killTerminalSession, getSessionId } from '../components/terminal/terminalSessions'
import { isModKey } from '../utils/platform'
import { useSettings, useSettingsMutations } from './useConvex'

const PANEL_HEIGHT_SAVE_DEBOUNCE_MS = 300
const TABS_SAVE_DEBOUNCE_MS = 500
const DEFAULT_TERMINAL_PANEL_HEIGHT = 300
const MIN_PANEL_HEIGHT = 100
const MAX_PANEL_HEIGHT = 1200

function clampPanelHeight(value: number): number {
  /* v8 ignore start */
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_PANEL_HEIGHT
  /* v8 ignore stop */
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
  reorderTerminalTabs: (fromId: string, toId: string) => void
  updateTabCwd: (tabId: string, cwd: string) => void
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
  const tabsSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const terminalTabsRef = useRef(terminalTabs)
  terminalTabsRef.current = terminalTabs
  const terminalOpenRef = useRef(terminalOpen)
  terminalOpenRef.current = terminalOpen
  const activeViewIdRef = useRef(activeViewId)
  activeViewIdRef.current = activeViewId

  // Convex persistence
  const settings = useSettings()
  const { updateTerminalPanelHeight, updateTerminalTabs } = useSettingsMutations()

  // Load persisted state on mount (local IPC is fast/immediate)
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      window.ipcRenderer.invoke('config:get-terminal-open') as Promise<boolean>,
      window.ipcRenderer.invoke('config:get-terminal-panel-height') as Promise<number>,
    ]).then(([openResult, heightResult]) => {
      /* v8 ignore start */
      if (cancelled) return
      /* v8 ignore stop */
      if (openResult.status === 'fulfilled' && typeof openResult.value === 'boolean') {
        setTerminalOpen(openResult.value)
      }
      if (heightResult.status === 'fulfilled' && typeof heightResult.value === 'number') {
        setPanelHeight(clampPanelHeight(heightResult.value))
      }
      setLoaded(true)
    })
    /* v8 ignore start */
    return () => {
      cancelled = true
    }
    /* v8 ignore stop */
  }, [])

  // Sync from Convex when available (fills in on new machines with no local config)
  /* v8 ignore start -- Convex sync only fires on new devices; tested via integration */
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
  }, [settings?.terminalPanelHeight, loaded])
  /* v8 ignore stop */

  // Restore terminal tabs from Convex on first load (only if no tabs exist yet)
  const restoredRef = useRef(false)
  /* v8 ignore start -- tab restoration from Convex; hard to unit-test due to async isolation */
  useEffect(() => {
    if (restoredRef.current || !loaded || !settings?.terminalTabs?.length) return
    if (terminalTabsRef.current.length > 0) return
    restoredRef.current = true

    async function restoreTabs() {
      const savedTabs = settings!.terminalTabs!
      const restored: TerminalTab[] = await Promise.all(
        savedTabs.map(async saved => {
          let cwd = saved.cwd
          // Re-resolve cwd for repo-based tabs (path may have changed or been empty)
          if (saved.repoSlug) {
            const [owner, repo] = saved.repoSlug.split('/')
            if (owner && repo) {
              try {
                const result = await window.terminal.resolveRepoPath(owner, repo)
                if (result.path) cwd = result.path
              } catch (_: unknown) {
                /* keep saved cwd */
              }
            }
          }
          return {
            id: `term-restore-${crypto.randomUUID()}`,
            title: saved.title,
            cwd,
            repoSlug: saved.repoSlug,
            color: saved.color,
          }
        })
      )
      terminalTabsRef.current = restored
      setTerminalTabs(restored)
      if (restored.length > 0) setActiveTerminalTabId(restored[0].id)
    }
    void restoreTabs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.terminalTabs, loaded])
  /* v8 ignore stop */

  // Auto-persist terminal tabs to Convex (debounced, skip initial mount)
  /* v8 ignore start -- debounce persistence; async timer + Convex update hard to isolate */
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (tabsSaveTimeoutRef.current) clearTimeout(tabsSaveTimeoutRef.current)
    tabsSaveTimeoutRef.current = setTimeout(() => {
      const payload = terminalTabs.map(t => ({
        title: t.title,
        cwd: t.cwd,
        repoSlug: t.repoSlug,
        color: t.color,
      }))
      updateTerminalTabs({ tabs: payload }).catch(err => {
        console.warn('Failed to persist terminal tabs:', err)
      })
    }, TABS_SAVE_DEBOUNCE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalTabs])
  /* v8 ignore stop */

  // Cleanup debounce timers on unmount
  /* v8 ignore start -- cleanup runs only on unmount */
  useEffect(() => {
    return () => {
      if (heightSaveTimeoutRef.current) clearTimeout(heightSaveTimeoutRef.current)
      if (tabsSaveTimeoutRef.current) clearTimeout(tabsSaveTimeoutRef.current)
    }
  }, [])
  /* v8 ignore stop */

  const addTerminalTab = useCallback(async (repoContext: RepoContext | null) => {
    let cwd = ''
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
        /* v8 ignore start */
        cwd = result.path || ''
        /* v8 ignore stop */
      } catch (_: unknown) {
        // Fall back to empty cwd if path resolution fails
      }
    } else {
      title = `Terminal ${nextTabNumber++}`
    }

    const tabId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newTab: TerminalTab = {
      id: tabId,
      title,
      cwd,
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

      if (!next) return

      const currentTabs = terminalTabsRef.current
      const repoContext = activeViewId ? getRepoContextFromViewId(activeViewId) : null

      if (currentTabs.length === 0) {
        void addTerminalTab(repoContext)
        return
      }

      if (!repoContext) return

      const slug = `${repoContext.owner}/${repoContext.repo}`
      const existing = currentTabs.find(t => t.repoSlug === slug)
      if (existing) {
        setActiveTerminalTabId(existing.id)
      } else {
        void addTerminalTab(repoContext)
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

  const onPanelResize = useCallback(
    (sizes: number[]) => {
      // sizes[0] = content height, sizes[1] = terminal panel height
      if (sizes.length >= 2 && sizes[1] > 0) {
        const clamped = clampPanelHeight(sizes[1])
        setPanelHeight(clamped)

        /* v8 ignore start */
        if (heightSaveTimeoutRef.current) clearTimeout(heightSaveTimeoutRef.current)
        /* v8 ignore stop */
        heightSaveTimeoutRef.current = setTimeout(() => {
          window.ipcRenderer.invoke('config:set-terminal-panel-height', clamped).catch(() => {})
          /* v8 ignore start */
          updateTerminalPanelHeight({ height: clamped }).catch(() => {})
          /* v8 ignore stop */
        }, PANEL_HEIGHT_SAVE_DEBOUNCE_MS)
      }
    },
    [updateTerminalPanelHeight]
  )

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
    []
  )

  const renameTerminalTab = useCallback(
    (tabId: string, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      applyTabsUpdate(prev => {
        const tab = prev.find(t => t.id === tabId)
        /* v8 ignore start */
        if (!tab || tab.title === trimmed) return null
        /* v8 ignore stop */
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
        /* v8 ignore start */
        if (!tab || tab.cwd === cwd) return null
        /* v8 ignore stop */
        return prev.map(t => (t.id === tabId ? { ...t, cwd } : t))
      })
    },
    [applyTabsUpdate]
  )

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
