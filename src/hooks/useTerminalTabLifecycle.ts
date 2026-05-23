import { useCallback, type MutableRefObject } from 'react'
import { getRepoContextFromViewId, type RepoContext } from '../utils/repoContext'
import { killTerminalSession } from '../components/terminal/terminalSessions'
import { IPC_INVOKE } from '../ipc/contracts'
import { tryResolveRepoPath } from './useTerminalPersistence'
import type { TerminalTab } from './useTerminalPanel'

function findTabBySlug(tabs: TerminalTab[], slug: string): TerminalTab | undefined {
  return tabs.find(t => t.repoSlug === slug)
}

function resolveViewRepoContext(activeViewId: string | null | undefined): RepoContext | null {
  return activeViewId ? getRepoContextFromViewId(activeViewId) : null
}

let nextTabNumber = 1

interface UseTerminalTabLifecycleOptions {
  terminalTabsRef: MutableRefObject<TerminalTab[]>
  terminalOpenRef: MutableRefObject<boolean>
  activeTerminalTabId: string | null
  setTerminalOpen: (open: boolean) => void
  setTerminalTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>
  setActiveTerminalTabId: (id: string | null) => void
}

/**
 * Provides tab lifecycle callbacks (add, toggle, close) extracted from useTerminalPanel.
 */
export function useTerminalTabLifecycle({
  terminalTabsRef,
  terminalOpenRef,
  activeTerminalTabId,
  setTerminalOpen,
  setTerminalTabs,
  setActiveTerminalTabId,
}: UseTerminalTabLifecycleOptions) {
  const addTerminalTab = useCallback(
    async (repoContext: RepoContext | null) => {
      let cwd = ''
      let title: string
      let repoSlug: string | undefined

      if (repoContext) {
        repoSlug = `${repoContext.owner}/${repoContext.repo}`

        // Optimistic dedup via ref (avoids unnecessary IPC calls)
        const existing = findTabBySlug(terminalTabsRef.current, repoSlug)
        if (existing) {
          setActiveTerminalTabId(existing.id)
          return existing
        }

        title = repoContext.repo
        cwd = await tryResolveRepoPath(repoContext.owner, repoContext.repo)
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
        const existing = findTabBySlug(terminalTabsRef.current, repoSlug)
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
    },
    [terminalTabsRef, setActiveTerminalTabId, setTerminalTabs]
  )

  const toggleTerminal = useCallback(
    (activeViewId?: string | null) => {
      const next = !terminalOpenRef.current
      terminalOpenRef.current = next
      setTerminalOpen(next)
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_TERMINAL_OPEN, next).catch(() => {})

      if (!next) return

      const currentTabs = terminalTabsRef.current
      const repoContext = resolveViewRepoContext(activeViewId)

      if (currentTabs.length === 0) {
        void addTerminalTab(repoContext)
        return
      }

      if (!repoContext) return
      const slug = `${repoContext.owner}/${repoContext.repo}`
      const existing = findTabBySlug(currentTabs, slug)
      if (existing) setActiveTerminalTabId(existing.id)
      else void addTerminalTab(repoContext)
    },
    [addTerminalTab, terminalOpenRef, terminalTabsRef, setTerminalOpen, setActiveTerminalTabId]
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
    [activeTerminalTabId, terminalTabsRef, setTerminalTabs, setActiveTerminalTabId, setTerminalOpen]
  )

  return { addTerminalTab, toggleTerminal, closeTerminalTab }
}
