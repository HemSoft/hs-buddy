import { useEffect, useRef, type RefObject } from 'react'
import { X, Heart, Users } from 'lucide-react'
import { APP_VERSION } from '../constants/appVersion'
import { useLatest } from '../hooks/useLatest'
import { GithubIcon } from './icons/GithubIcon'
import './AboutModal.css'

interface AboutModalProps {
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element => !element.hasAttribute('disabled') && element.tabIndex >= 0
  )
}

function focusFirstElement(dialog: HTMLElement): void {
  const focusableElements = getFocusableElements(dialog)
  if (focusableElements.length === 0) {
    dialog.focus()
    return
  }
  focusableElements[0].focus()
}

function trapTabKey(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusableElements = getFocusableElements(dialog)
  if (focusableElements.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const firstFocusableElement = focusableElements[0]
  const lastFocusableElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement
  const focusIsOutside = !dialog.contains(activeElement)

  if (event.shiftKey && (activeElement === firstFocusableElement || focusIsOutside)) {
    event.preventDefault()
    lastFocusableElement.focus()
    return
  }

  if (!event.shiftKey && (activeElement === lastFocusableElement || focusIsOutside)) {
    event.preventDefault()
    firstFocusableElement.focus()
  }
}

function useAboutModalFocus(onClose: () => void, returnFocusRef?: RefObject<HTMLElement | null>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useLatest(onClose)

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const explicitReturnTarget = returnFocusRef?.current
    const dialog = dialogRef.current
    if (dialog) focusFirstElement(dialog)

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeDialog = dialogRef.current
      if (!activeDialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        onCloseRef.current()
        return
      }
      if (event.key === 'Tab') trapTabKey(event, activeDialog)
    }
    const handleFocusIn = (event: FocusEvent) => {
      const activeDialog = dialogRef.current
      if (activeDialog && !activeDialog.contains(event.target as Node)) {
        focusFirstElement(activeDialog)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      const returnTarget =
        explicitReturnTarget ?? (previouslyFocused?.isConnected ? previouslyFocused : null)
      returnTarget?.focus()
    }
  }, [onCloseRef, returnFocusRef])

  return dialogRef
}

function openGitHub(): void {
  window.shell.openExternal('https://github.com/relias-engineering/hs-buddy')
}

function AboutDialogContent({ onClose }: Pick<AboutModalProps, 'onClose'>) {
  return (
    <>
      <button
        aria-label="Close"
        type="button"
        className="about-close-button"
        onClick={onClose}
        title="Close"
      >
        <X size={18} aria-hidden="true" />
      </button>

      <div className="about-content">
        <div className="about-icon" aria-hidden="true">
          <Users size={48} strokeWidth={2.5} />
        </div>
        <h1 id="about-modal-title" className="about-app-name">
          Buddy
        </h1>
        <div className="about-version-badge">Version {APP_VERSION}</div>
        <div className="about-tagline">
          <span className="about-tagline-emoji" aria-hidden="true">
            🤝
          </span>
          <span>Your Universal Productivity Companion</span>
        </div>
        <p className="about-description">
          A powerful desktop app for managing GitHub PRs, automating workflows, and boosting
          productivity with the HemSoft skills infrastructure.
        </p>
        <div className="about-tech-stack">
          <div className="tech-item">
            <span className="tech-label">RUNTIME</span>
            <span className="tech-value">Electron 30</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">FRAMEWORK</span>
            <span className="tech-value">React 18</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">BUILD</span>
            <span className="tech-value">Vite + Bun</span>
          </div>
        </div>
        <button type="button" className="about-github-link" onClick={openGitHub}>
          <GithubIcon size={16} aria-hidden="true" />
          <span>View on GitHub</span>
        </button>
        <div className="about-footer">
          <span>Made with</span>
          <Heart size={14} className="about-heart" aria-hidden="true" />
          <span>by HemSoft Developments</span>
        </div>
      </div>
    </>
  )
}

export function AboutModal({ onClose, returnFocusRef }: AboutModalProps) {
  const dialogRef = useAboutModalFocus(onClose, returnFocusRef)

  return (
    <div className="about-modal-overlay" role="presentation">
      <button
        type="button"
        className="about-modal-backdrop"
        aria-label="Close About dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="about-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        tabIndex={-1}
      >
        <AboutDialogContent onClose={onClose} />
      </div>
    </div>
  )
}
