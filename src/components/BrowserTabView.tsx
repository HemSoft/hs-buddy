import { useEffect, useRef, useState } from 'react'
import './BrowserTabView.css'

interface BrowserTabViewProps {
  url: string
  onTitleChange?: (title: string) => void
}

export function BrowserTabView({ url, onTitleChange }: BrowserTabViewProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      onTitleChange?.(e.title)
    }
    const handleNavigate = (e: Electron.DidNavigateEvent) => {
      setCurrentUrl(e.url)
    }
    const handleStartLoad = () => setLoading(true)
    const handleStopLoad = () => setLoading(false)

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
