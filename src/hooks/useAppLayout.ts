import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_ASSISTANT_PANE_SIZE, DEFAULT_PANE_SIZES, normalizePaneSizes } from '../appUtils'
import { isModKey } from '../utils/platform'
import { IPC_INVOKE, IPC_PUSH } from '../ipc/contracts'

const PANE_SAVE_DEBOUNCE_MS = 300

interface LayoutState {
  paneSizes: number[]
  assistantOpen: boolean
}

function resolveLoadedPaneSizes(result: PromiseSettledResult<number[]>): number[] {
  return result.status === 'fulfilled' ? normalizePaneSizes(result.value) : [...DEFAULT_PANE_SIZES]
}

function resolveLoadedAssistantOpen(result: PromiseSettledResult<boolean>): boolean {
  return result.status === 'fulfilled' && typeof result.value === 'boolean' ? result.value : false
}

function useAssistantShortcuts(toggleAssistant: () => void): void {
  useEffect(() => {
    window.ipcRenderer.on(IPC_PUSH.TOGGLE_ASSISTANT, toggleAssistant)
    return () => {
      window.ipcRenderer.off(IPC_PUSH.TOGGLE_ASSISTANT, toggleAssistant)
    }
  }, [toggleAssistant])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isModKey(event) && event.shiftKey && event.key === 'A') {
        event.preventDefault()
        toggleAssistant()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleAssistant])
}

export function useAppLayout() {
  const [layoutState, setLayoutState] = useState<LayoutState>({
    paneSizes: [...DEFAULT_PANE_SIZES],
    assistantOpen: false,
  })
  const [loaded, setLoaded] = useState(false)
  const { paneSizes, assistantOpen } = layoutState
  const paneSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isCancelled = false

    Promise.allSettled([
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_PANE_SIZES) as Promise<number[]>,
      window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_GET_ASSISTANT_OPEN) as Promise<boolean>,
    ]).then(([paneSizesResult, assistantOpenResult]) => {
      if (isCancelled) return
      setLayoutState({
        paneSizes: resolveLoadedPaneSizes(paneSizesResult),
        assistantOpen: resolveLoadedAssistantOpen(assistantOpenResult),
      })
      setLoaded(true)
    })

    return () => {
      isCancelled = true
    }
  }, [])

  const clearPendingPaneSave = useCallback(() => {
    const timeout = paneSaveTimeoutRef.current
    if (timeout) {
      clearTimeout(timeout)
      paneSaveTimeoutRef.current = null
    }
  }, [])

  useEffect(() => clearPendingPaneSave, [clearPendingPaneSave])

  const handlePaneChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length < 2 || !sizes.every(size => size > 0)) return

      setLayoutState(currentState => {
        const fullSizes =
          sizes.length === 2
            ? [sizes[0], sizes[1], currentState.paneSizes[2] || DEFAULT_ASSISTANT_PANE_SIZE]
            : sizes
        return { ...currentState, paneSizes: fullSizes }
      })

      clearPendingPaneSave()
      paneSaveTimeoutRef.current = setTimeout(() => {
        setLayoutState(currentState => {
          window.ipcRenderer
            .invoke(IPC_INVOKE.CONFIG_SET_PANE_SIZES, currentState.paneSizes)
            .catch(() => {})
          return currentState
        })
      }, PANE_SAVE_DEBOUNCE_MS)
    },
    [clearPendingPaneSave]
  )

  const toggleAssistant = useCallback(() => {
    setLayoutState(currentState => {
      const nextAssistantOpen = !currentState.assistantOpen
      window.ipcRenderer
        .invoke(IPC_INVOKE.CONFIG_SET_ASSISTANT_OPEN, nextAssistantOpen)
        .catch(() => {})
      return { ...currentState, assistantOpen: nextAssistantOpen }
    })
  }, [])

  useAssistantShortcuts(toggleAssistant)

  return {
    assistantOpen,
    handlePaneChange,
    loaded,
    paneSizes,
    toggleAssistant,
  }
}
