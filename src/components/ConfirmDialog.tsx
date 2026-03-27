import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  message: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  message,
  description,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div className="confirm-dialog-overlay" role="presentation" onClick={handleOverlayClick}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby={description ? 'confirm-dialog-desc' : undefined}>
        <div className="confirm-dialog-body">
          {variant === 'danger' && (
            <div className="confirm-dialog-icon">
              <AlertTriangle size={20} />
            </div>
          )}
          <div className="confirm-dialog-text">
            <p id="confirm-dialog-title" className="confirm-dialog-message">{message}</p>
            {description && <p id="confirm-dialog-desc" className="confirm-dialog-description">{description}</p>}
          </div>
        </div>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn confirm-dialog-btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            className={`confirm-dialog-btn ${variant === 'danger' ? 'confirm-dialog-btn-danger' : 'confirm-dialog-btn-confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
