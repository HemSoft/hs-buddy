import { useCallback, useEffect, useReducer, useRef } from 'react'
import './BrowserTabView.css'

interface BrowserTabViewProps {
  url: string
  onTitleChange?: (title: string) => void
}

const ZOOM_STEP = 0.5
const ZOOM_MIN = -4
const ZOOM_MAX = 5
const ZOOM_STORAGE_KEY = 'browser-zoom-level'

interface BrowserTabState {
  navigatedUrl: string | null
  loading: boolean
}

type BrowserTabAction =
  | { type: 'navigate'; url: string }
  | { type: 'reset' }
  | { type: 'start-loading' }
  | { type: 'stop-loading' }

function browserTabReducer(state: BrowserTabState, action: BrowserTabAction): BrowserTabState {
  switch (action.type) {
    case 'navigate':
      return { ...state, navigatedUrl: action.url }
    case 'reset':
      return { navigatedUrl: null, loading: true }
    case 'start-loading':
      return { ...state, loading: true }
    case 'stop-loading':
      return { ...state, loading: false }
    default:
      return state
  }
}

export function BrowserTabView({ url, onTitleChange }: BrowserTabViewProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [{ navigatedUrl, loading }, dispatch] = useReducer(browserTabReducer, {
    navigatedUrl: null,
    loading: true,
  })
  const zoomLevelRef = useRef(
    (() => {
      const stored = localStorage.getItem(ZOOM_STORAGE_KEY)
      return stored ? Number(stored) : 0
    })()
  )
  const currentUrl = navigatedUrl ?? url

  const zoomIn= useCallback(() => {
    const next = Math.min(zoomLevelRef.current + ZOOM_STEP, ZOOM_MAX)
    zoomLevelRef.current = next
    localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
    webviewRef.current?.setZoomLevel(next)
  }, [])

  const zoomOut = useCallback(() => {
    const next = Math.max(zoomLevelRef.current - ZOOM_STEP, ZOOM_MIN)
    zoomLevelRef.current = next
    localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
    webviewRef.current?.setZoomLevel(next)
  }, [])

  useEffect(() => {
    dispatch({ type: 'reset' })
  }, [url])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      onTitleChange?.(e.title)
    }
    const handleNavigate = (e: Electron.DidNavigateEvent) => {
      dispatch({ type: 'navigate', url: e.url })
    }
    const handleStartLoad = () => dispatch({ type: 'start-loading' })
    const handleStopLoad = () => {
      dispatch({ type: 'stop-loading' })
      if (zoomLevelRef.current !== 0) {
        webview.setZoomLevel(zoomLevelRef.current)
      }
    }

    const handleBeforeInput = (event: Event) => {
      const input = (
        event as Event & {
          input?: { type: string; key: string; control: boolean; meta: boolean; shift: boolean }
        }
      ).input
      if (!input || input.type !== 'keyDown') return
      const ctrlOrCmd = input.control || input.meta
      if (ctrlOrCmd && input.key === 'Tab') {
        event.preventDefault()
        window.dispatchEvent(new Event(input.shift ? 'app:tab-prev' : 'app:tab-next'))
      } else if (ctrlOrCmd && input.key === 'F4') {
        event.preventDefault()
        window.dispatchEvent(new Event('app:tab-close'))
      }
    }

    webview.addEventListener('before-input-event', handleBeforeInput)
    webview.addEventListener('page-title-updated', handleTitleUpdate)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-start-loading', handleStartLoad)
    webview.addEventListener('did-stop-loading', handleStopLoad)

    return () => {
      webview.removeEventListener('before-input-event', handleBeforeInput)
      webview.removeEventListener('page-title-updated', handleTitleUpdate)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-start-loading', handleStartLoad)
      webview.removeEventListener('did-stop-loading', handleStopLoad)
    }
  }, [onTitleChange])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        zoomOut()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut])

  return (
    <div className="browser-tab-view">
      <div className="browser-tab-toolbar">
        <button
          className="browser-tab-btn"
          onClick={() => webviewRef.current?.goBack()}
          title="Back"
          disabled={loading}
        >
          ←
        </button>
        <button
          className="browser-tab-btn"
          onClick={() => webviewRef.current?.goForward()}
          title="Forward"
          disabled={loading}
        >
          →
        </button>
        <button
          className="browser-tab-btn"
          onClick={() => (loading ? webviewRef.current?.stop() : webviewRef.current?.reload())}
          title={loading ? 'Stop' : 'Reload'}
        >
          {loading ? '✕' : '↻'}
        </button>
        <div className="browser-tab-url" title={currentUrl}>
          {loading && <span className="browser-tab-spinner" />}
          <span className="browser-tab-url-text">{currentUrl}</span>
        </div>
        <button className="browser-tab-btn" onClick={zoomOut} title="Zoom out (Alt + -)">
          −
        </button>
        <button className="browser-tab-btn" onClick={zoomIn} title="Zoom in (Alt + =)">
          +
        </button>
        <button
          className="browser-tab-btn"
          onClick={() => window.shell.openExternal(currentUrl)}
          title="Open in external browser"
        >
          ↗
        </button>
      </div>
      {/* eslint-disable react/no-unknown-property -- webview is an Electron-specific element */}
      <webview
        ref={webviewRef as React.RefObject<Electron.WebviewTag>}
        src={url}
        partition="persist:browser"
        className="browser-tab-webview"
        // @ts-expect-error webview string attribute
        allowpopups="true"
      />
      {/* eslint-enable react/no-unknown-property */}
    </div>
  )
}
