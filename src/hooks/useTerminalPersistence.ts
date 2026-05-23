import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalTab } from './useTerminalPanel'
import { useSettings, useSettingsMutations } from './useConvex'
import { IPC_INVOKE } from '../ipc/contracts'

const PANEL_HEIGHT_SAVE_DEBOUNCE_MS = 300
const TABS_SAVE_DEBOUNCE_MS = 500
const DEFAULT_TERMINAL_PANEL_HEIGHT = 300
const MIN_PANEL_HEIGHT = 100
const MAX_PANEL_HEIGHT = 1200

export function clampPanelHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_PANEL_HEIGHT
  return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, value))
}

function isFulfilledBoolean(
  r: PromiseSettledResult<unknown>
): r is PromiseFulfilledResult<boolean> {
  return r.status === 'fulfilled' && typeof r.value === 'boolean'
}

function isFulfilledNumber(r: PromiseSettledResult<unknown>): r is PromiseFulfilledResult<number> {
  return r.status === 'fulfilled' && typeof r.value === 'number'
}

function getStoredTerminalPanelHeight(settings: ReturnType<typeof useSettings>): number | null {
  return settings?.terminalPanelHeight ?? null
}

function getStoredTerminalTabs(settings: ReturnType<typeof useSettings>) {
  return settings?.terminalTabs ?? []
}

async function tryResolveRepoPath(owner: string, repo: string): Promise<string> {
  try {
    const result = await window.terminal.resolveRepoPath(owner, repo)
    return result.path || ''
  } catch (_: unknown) {
    return ''
  }
}

interface UseTerminalPersistenceOptions {
  terminalTabs: TerminalTab[]
  terminalTabsRef: React.MutableRefObject<TerminalTab[]>
  setTerminalOpen: (open: boolean) => void
  setTerminalTabs: (tabs: TerminalTab[]) => void
  setActiveTerminalTabId: (id: string | null) => void
  setPanelHeight: (h: number) => void
}

interface UseTerminalPersistenceReturn {
  loaded: boolean
  panelHeightSaveRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  updateTerminalPanelHeight: ReturnType<typeof useSettingsMutations>['updateTerminalPanelHeight']
  onPanelResize: (sizes: number[]) => void
}

export function useTerminalPersistence({
  terminalTabs,
  terminalTabsRef,
  setTerminalOpen,
  setTerminalTabs,
  setActiveTerminalTabId,
  setPanelHeight,
}: UseTerminalPersistenceOptions): UseTerminalPersistenceReturn {
  const [loaded, setLoaded] = useState(false)
  const heightSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabsSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const settings = useSettings()
  const storedTerminalPanelHeight = getStoredTerminalPanelHeight(settings)
  const storedTerminalTabs = getStoredTerminalTabs(settings)
  const { updateTerminalPanelHeight, updateTerminalTabs } = useSettingsMutations()

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
      if (isFulfilledBoolean(openResult)) {
        setTerminalOpen(openResult.value)
      }
      if (isFulfilledNumber(heightResult)) {
        setPanelHeight(clampPanelHeight(heightResult.value))
      }
      setLoaded(true)
    })
    /* v8 ignore start */
    return () => {
      cancelled = true
    }
    /* v8 ignore stop */
  }, [setPanelHeight, setTerminalOpen])

  // Sync from Convex when available (fills in on new machines with no local config)
  /* v8 ignore start -- Convex sync only fires on new devices; tested via integration */
  useEffect(() => {
    if (storedTerminalPanelHeight != null && loaded) {
      // Only apply Convex value if local didn't have one (first launch on new device)
      window.ipcRenderer
        .invoke(IPC_INVOKE.CONFIG_GET_TERMINAL_PANEL_HEIGHT)
        .then((local: unknown) => {
          if (local == null) {
            setPanelHeight(clampPanelHeight(storedTerminalPanelHeight))
          }
        })
        .catch(() => {})
    }
  }, [storedTerminalPanelHeight, loaded, setPanelHeight])
  /* v8 ignore stop */

  // Restore terminal tabs from Convex on first load (only if no tabs exist yet)
  const restoredRef = useRef(false)
  const savedTabCount = storedTerminalTabs.length
  /* v8 ignore start -- tab restoration from Convex; hard to unit-test due to async isolation */
  useEffect(() => {
    if (restoredRef.current || !loaded || !savedTabCount) return
    if (terminalTabsRef.current.length > 0) return
    restoredRef.current = true

    async function restoreTabs() {
      const savedTabs = storedTerminalTabs
      const restored: TerminalTab[] = await Promise.all(
        savedTabs.map(async saved => {
          let cwd = saved.cwd
          if (saved.repoSlug) {
            const [owner, repo] = saved.repoSlug.split('/')
            if (owner && repo) {
              const resolved = await tryResolveRepoPath(owner, repo)
              if (resolved) cwd = resolved
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
  }, [storedTerminalTabs, loaded])
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
          window.ipcRenderer
            .invoke(IPC_INVOKE.CONFIG_SET_TERMINAL_PANEL_HEIGHT, clamped)
            .catch(() => {})
          /* v8 ignore start */
          updateTerminalPanelHeight({ height: clamped }).catch(() => {})
          /* v8 ignore stop */
        }, PANEL_HEIGHT_SAVE_DEBOUNCE_MS)
      }
    },
    [updateTerminalPanelHeight, setPanelHeight]
  )

  return {
    loaded,
    panelHeightSaveRef: heightSaveTimeoutRef,
    updateTerminalPanelHeight,
    onPanelResize,
  }
}

export { DEFAULT_TERMINAL_PANEL_HEIGHT, PANEL_HEIGHT_SAVE_DEBOUNCE_MS, tryResolveRepoPath }
