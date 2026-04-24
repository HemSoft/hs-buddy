import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_ASSISTANT_PANE_SIZE, DEFAULT_PANE_SIZES, normalizePaneSizes } from '../appUtils'
import { isModKey } from '../utils/platform'

const PANE_SAVE_DEBOUNCE_MS = 300

interface LayoutState {
  paneSizes: number[]
  assistantOpen: boolean
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
      window.ipcRenderer.invoke('config:get-pane-sizes') as Promise<number[]>,
      window.ipcRenderer.invoke('config:get-assistant-open') as Promise<boolean>,
    ]).then(([paneSizesResult, assistantOpenResult]) => {
      if (isCancelled) {
        return
      }

      const nextPaneSizes =
        paneSizesResult.status === 'fulfilled'
          ? normalizePaneSizes(paneSizesResult.value)
          : [...DEFAULT_PANE_SIZES]

      const nextAssistantOpen =
        assistantOpenResult.status === 'fulfilled' && typeof assistantOpenResult.value === 'boolean'
          ? assistantOpenResult.value
          : false

      setLayoutState({
        paneSizes: nextPaneSizes,
        assistantOpen: nextAssistantOpen,
      })
      setLoaded(true)
    })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (paneSaveTimeoutRef.current) {
        clearTimeout(paneSaveTimeoutRef.current)
      }
    }
  }, [])

  const handlePaneChange = useCallback((sizes: number[]) => {
    if (sizes.length < 2 || !sizes.every(size => size > 0)) {
      return
    }

    setLayoutState(currentState => {
      // When assistant is closed, Allotment reports 2 sizes — preserve the saved assistant size
      const fullSizes =
        sizes.length === 2
          ? [sizes[0], sizes[1], currentState.paneSizes[2] || DEFAULT_ASSISTANT_PANE_SIZE]
          : sizes

      return { ...currentState, paneSizes: fullSizes }
    })

    if (paneSaveTimeoutRef.current) {
      clearTimeout(paneSaveTimeoutRef.current)
    }

    paneSaveTimeoutRef.current = setTimeout(() => {
      setLayoutState(currentState => {
        window.ipcRenderer.invoke('config:set-pane-sizes', currentState.paneSizes)
        return currentState
      })
    }, PANE_SAVE_DEBOUNCE_MS)
  }, [])

  const toggleAssistant = useCallback(() => {
    setLayoutState(currentState => {
      const nextAssistantOpen = !currentState.assistantOpen
      window.ipcRenderer.invoke('config:set-assistant-open', nextAssistantOpen).catch(() => {})
      return {
        ...currentState,
        assistantOpen: nextAssistantOpen,
      }
    })
  }, [])

  useEffect(() => {
    window.ipcRenderer.on('toggle-assistant', toggleAssistant)
    return () => {
      window.ipcRenderer.off('toggle-assistant', toggleAssistant)
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

  return {
    assistantOpen,
    handlePaneChange,
    loaded,
    paneSizes,
    toggleAssistant,
  }
}
