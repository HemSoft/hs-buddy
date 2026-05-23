import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
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
  }
}

function getWebviewShortcutInput(event: Event) {
  const input = (
    event as Event & {
      input?: { type: string; key: string; control: boolean; meta: boolean; shift: boolean }
    }
  ).input
  if (!input || input.type !== 'keyDown') return null
  if (!input.control && !input.meta) return null
  return input
}

function handleWebviewBeforeInput(event: Event, shortcuts: Record<string, (s: boolean) => string>) {
  const input = getWebviewShortcutInput(event)
  if (!input) return
  const fn = shortcuts[input.key]
  if (fn) {
    event.preventDefault()
    window.dispatchEvent(new Event(fn(input.shift)))
  }
}

function handleZoomKeydown(e: KeyboardEvent, zoomIn: () => void, zoomOut: () => void) {
  if (!e.altKey) return
  if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    zoomIn()
  } else if (e.key === '-') {
    e.preventDefault()
    zoomOut()
  }
}

function setupWebviewListeners(
  webview: Electron.WebviewTag,
  dispatch: React.Dispatch<BrowserTabAction>,
  zoomLevelRef: React.MutableRefObject<number>,
  onTitleChange: ((title: string) => void) | undefined
) {
  const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
    onTitleChange?.(e.title)
  }
  const handleNavigate = (e: Electron.DidNavigateEvent) => {
    dispatch({ type: 'navigate', url: e.url })
  }
  const handleStartLoad = () => dispatch({ type: 'start-loading' })
  const handleStopLoad = () => {
    dispatch({ type: 'stop-loading' })
    if (zoomLevelRef.current !== 0) webview.setZoomLevel(zoomLevelRef.current)
  }
  const SHORTCUTS: Record<string, (s: boolean) => string> = {
    Tab: s => (s ? 'app:tab-prev' : 'app:tab-next'),
    F4: () => 'app:tab-close',
  }
  const handleBeforeInput = (event: Event) => {
    handleWebviewBeforeInput(event, SHORTCUTS)
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
}

function BrowserToolbar({
  loading,
  currentUrl,
  webviewRef,
  zoomIn,
  zoomOut,
}: {
  loading: boolean
  currentUrl: string
  webviewRef: React.RefObject<Electron.WebviewTag | null>
  zoomIn: () => void
  zoomOut: () => void
}) {
  return (
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
  )
}

export function BrowserTabView({ url, onTitleChange }: BrowserTabViewProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [{ navigatedUrl, loading }, dispatch] = useReducer(browserTabReducer, {
    navigatedUrl: null,
    loading: true,
  })
  const zoomLevelRef = useRef(Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 0)
  const currentUrl = navigatedUrl ?? url

  const applyZoom = (next: number) => {
    zoomLevelRef.current = next
    localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
    webviewRef.current?.setZoomLevel(next)
  }
  const zoomIn = useCallback(
    () => applyZoom(Math.min(zoomLevelRef.current + ZOOM_STEP, ZOOM_MAX)),
    []
  )
  const zoomOut = useCallback(
    () => applyZoom(Math.max(zoomLevelRef.current - ZOOM_STEP, ZOOM_MIN)),
    []
  )

  useLayoutEffect(() => {
    const wv = webviewRef.current
    /* v8 ignore start -- ref is always set after initial render */
    if (!wv) return
    /* v8 ignore stop */
    wv.setAttribute('partition', 'persist:browser')
    wv.setAttribute('allowpopups', 'true')
    wv.setAttribute('src', url)
  }, [url])

  useEffect(() => {
    dispatch({ type: 'reset' })
  }, [url])

  useEffect(() => {
    const webview = webviewRef.current
    /* v8 ignore start -- ref is always set after initial render */
    if (!webview) return
    /* v8 ignore stop */
    return setupWebviewListeners(webview, dispatch, zoomLevelRef, onTitleChange)
  }, [onTitleChange])

  useEffect(() => {
    const h = (e: KeyboardEvent) => handleZoomKeydown(e, zoomIn, zoomOut)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [zoomIn, zoomOut])

  return (
    <div className="browser-tab-view">
      <BrowserToolbar
        loading={loading}
        currentUrl={currentUrl}
        webviewRef={webviewRef}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
      />
      <webview
        ref={webviewRef as React.RefObject<Electron.WebviewTag>}
        className="browser-tab-webview"
      />
    </div>
  )
}
