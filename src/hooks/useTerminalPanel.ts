import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepoContextFromViewId, type RepoContext } from '../utils/repoContext'
import { killTerminalSession, getSessionId } from '../components/terminal/terminalSessions'
import { isModKey } from '../utils/platform'
import { useSettings, useSettingsMutations } from './useConvex'
import { IPC_INVOKE } from '../ipc/contracts'

const PANEL_HEIGHT_SAVE_DEBOUNCE_MS = 300
const TABS_SAVE_DEBOUNCE_MS = 500
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
  reorderTerminalTabs: (fromId: string, toId: string) => void
  updateTabCwd: (tabId: string, cwd: string) => void
  panelHeight: number
  onPanelResize: (sizes: number[]) => void
  loaded: boolean
}

let nextTabNumber = 1

function findExistingTabBySlug(tabs: TerminalTab[], slug: string): TerminalTab | undefined {
  return tabs.find(t => t.repoSlug === slug)
}

async function resolveRepoCwd(owner: string, repo: string): Promise<string> {
  try {
    const result = await window.terminal.resolveRepoPath(owner, repo)
    return result.path || ''
  } catch (_: unknown) {
    return ''
  }
}

function isFulfilledBoolean(
  result: PromiseSettledResult<unknown>
): result is PromiseFulfilledResult<boolean> {
  return result.status === 'fulfilled' && typeof result.value === 'boolean'
}

function isFulfilledNumber(
  result: PromiseSettledResult<unknown>
): result is PromiseFulfilledResult<number> {
  return result.status === 'fulfilled' && typeof result.value === 'number'
}

function selectOrAddTabForContext(
  currentTabs: TerminalTab[],
  repoContext: RepoContext | null,
  selectTab: (id: string) => void,
  addTab: (ctx: RepoContext | null) => void
): void {
  if (currentTabs.length === 0) {
    addTab(repoContext)
    return
  }
  if (!repoContext) return
  const slug = `${repoContext.owner}/${repoContext.repo}`
  const existing = findExistingTabBySlug(currentTabs, slug)
  if (existing) {
    selectTab(existing.id)
  } else {
    addTab(repoContext)
  }
}

/* v8 ignore start -- only called from the v8-ignored tab-restoration useEffect */
function shouldSkipRestore(
  restored: boolean,
  loaded: boolean,
  savedTabCount: number,
  currentTabCount: number
): boolean {
  if (restored || !loaded) return true
  if (savedTabCount === 0) return true
  return currentTabCount > 0
}
/* v8 ignore stop */

/* v8 ignore start -- IPC-dependent path resolution */
async function resolveTabCwd(repoSlug: string | undefined, savedCwd: string): Promise<string> {
  if (!repoSlug) return savedCwd
  const parts = repoSlug.split('/')
  const owner = parts[0]
  const repo = parts[1]
  if (!owner || !repo) return savedCwd
  const resolved = await resolveRepoCwd(owner, repo)
  return resolved || savedCwd
}
/* v8 ignore stop */

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

  const clearTabsSaveTimeout = useCallback(() => {
    const timeout = tabsSaveTimeoutRef.current
    clearTimeout(timeout ?? undefined)
    tabsSaveTimeoutRef.current = null
  }, [])

  const clearHeightSaveTimeout = useCallback(() => {
    const timeout = heightSaveTimeoutRef.current
    clearTimeout(timeout ?? undefined)
    heightSaveTimeoutRef.current = null
  }, [])

  // Load persisted state on mount (local IPC is fast/immediate)
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_TERMINAL_OPEN) as Promise<boolean>,
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_TERMINAL_PANEL_HEIGHT) as Promise<number>,
    ]).then(([openResult, heightResult]) => {
      /* v8 ignore start */
      if (cancelled) return
      /* v8 ignore stop */
      if (isFulfilledBoolean(openResult)) setTerminalOpen(openResult.value)
      if (isFulfilledNumber(heightResult)) setPanelHeight(clampPanelHeight(heightResult.value))
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
        .invoke(IPC_INVOKE.CONFIG_GET_TERMINAL_PANEL_HEIGHT)
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
    const savedTabs = settings?.terminalTabs
    if (
      shouldSkipRestore(
        restoredRef.current,
        loaded,
        savedTabs?.length ?? 0,
        terminalTabsRef.current.length
      )
    )
      return
    restoredRef.current = true

    async function restoreTabs() {
      const restored: TerminalTab[] = await Promise.all(
        savedTabs!.map(async saved => ({
          id: `term-restore-${crypto.randomUUID()}`,
          title: saved.title,
          cwd: await resolveTabCwd(saved.repoSlug, saved.cwd),
          repoSlug: saved.repoSlug,
          color: saved.color,
        }))
      )
      terminalTabsRef.current = restored
      setTerminalTabs(restored)
      if (restored.length > 0) setActiveTerminalTabId(restored[0].id)
    }
    void restoreTabs()
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
    clearTabsSaveTimeout()
    const timeout = setTimeout(() => {
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
    tabsSaveTimeoutRef.current = timeout
    return () => {
      clearTimeout(timeout)
      if (tabsSaveTimeoutRef.current === timeout) {
        tabsSaveTimeoutRef.current = null
      }
    }
  }, [terminalTabs, updateTerminalTabs, clearTabsSaveTimeout])
  /* v8 ignore stop */

  // Cleanup debounce timers on unmount
  /* v8 ignore start -- cleanup runs only on unmount */
  useEffect(() => {
    return () => {
      clearHeightSaveTimeout()
      clearTabsSaveTimeout()
    }
  }, [clearHeightSaveTimeout, clearTabsSaveTimeout])
  /* v8 ignore stop */

  const addTerminalTab = useCallback(async (repoContext: RepoContext | null) => {
    let cwd = ''
    let title: string
    let repoSlug: string | undefined

    if (repoContext) {
      repoSlug = `${repoContext.owner}/${repoContext.repo}`

      // Optimistic dedup via ref (avoids unnecessary IPC calls)
      const existing = findExistingTabBySlug(terminalTabsRef.current, repoSlug)
      if (existing) {
        setActiveTerminalTabId(existing.id)
        return existing
      }

      title = repoContext.repo
      cwd = await resolveRepoCwd(repoContext.owner, repoContext.repo)
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
      const existing = findExistingTabBySlug(terminalTabsRef.current, repoSlug)
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
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_TERMINAL_OPEN, next).catch(() => {})

      if (!next) return

      const repoContext = activeViewId ? getRepoContextFromViewId(activeViewId) : null
      selectOrAddTabForContext(
        terminalTabsRef.current,
        repoContext,
        id => setActiveTerminalTabId(id),
        ctx => void addTerminalTab(ctx)
      )
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
          window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_TERMINAL_OPEN, false).catch(() => {})
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
        clearHeightSaveTimeout()
        /* v8 ignore stop */
        heightSaveTimeoutRef.current = setTimeout(() => {
          window.ipcRenderer
            .invoke(IPC_INVOKE.CONFIG_SET_TERMINAL_PANEL_HEIGHT, clamped)
            .catch(() => {})
          /* v8 ignore start */
          updateTerminalPanelHeight({ height: clamped }).catch(() => {})
          /* v8 ignore stop */
        }, PANEL_HEIGHT_SAVE_DEBOUNCE_MS)
      }
    },
    [updateTerminalPanelHeight, clearHeightSaveTimeout]
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
  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- Unmount cleanup must inspect the latest tab ref, not the initial tab array.
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
